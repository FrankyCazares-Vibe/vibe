# Wave 2 as-is: build notes, reviewer deltas and contract-vs-code differences

Written in a CLOUD session on 2026-09-30 (reader "build-notes-deltas"; repo HEAD `15a8286`, main = wave 1 live + docs commits). No database, no browser, no `.env.local`: every claim below is a `path:line` read of a handoff or of the code. Companion of `routes-map.md`, `database-map.md`, `messages-mobile-map.md` and `mockups-map.md` in this folder.

What it holds:

1. The complete list of "wave 2 carry-overs" with their source and a one-line proposed resolution.
2. Every decision or default already made that constrains wave 2, with the document that made it.
3. Every reviewer finding of wave 1 marked "wave 2", "later", "for the wave 2 contract", "not blocking" or "accepted for v1".
4. The HTTP integration pass of wave 1: what was validated, how the cookie tool works, what the Mac re-runs for wave 2.
5. Gotchas (workflow resume, usage limits, Supabase MCP, canvas).
6. Where the built code differs from `wave-1-contracts.md` text (the notes admit it), three of them verified against the code.
7. Schedule facts and what a cloud session may and may not do.
8. Surprises (the only opinions in this file).

Sources read in full: `handoffs/2026-09-30-session-69-close-chat-wave-1-live.md` (61 lines), `handoffs/2026-09-29-session-69-chat-wave-0.md` (95), every file in `handoffs/chat-redesign/wave-1-build/` (42 files incl. `tools/cookie.mjs`), `wave-1-contracts.md` sections 12, 14, 15, 16 (`:603-674`), `plan-critique.md` (420 lines), `wave-0-decisions.md` (58 lines). Short names: CLOSE = `handoffs/2026-09-30-session-69-close-chat-wave-1-live.md`; S69 = `handoffs/2026-09-29-session-69-chat-wave-0.md`; CONTRACT = `handoffs/chat-redesign/wave-1-contracts.md`; CRITIQUE = `handoffs/chat-redesign/plan-critique.md`; W0 = `handoffs/chat-redesign/wave-0-decisions.md`; BUILD = `handoffs/chat-redesign/wave-1-build/`.

---

## 1. Wave 2 carry-overs (complete list, with source and a proposed resolution)

The two handoffs list carry-overs twice (CLOSE `:37-46`, S69 `:85`); the reviews and repairs add more that never reached those lists. Each row: what, where it was written, what wave 2 is asked to do. "Resolution" is the smallest thing that closes it; the orchestrator's D-defaults are named where they already answer it.

| # | carry-over | source (path:line) | proposed resolution |
|---|---|---|---|
| C1 | The thread GET re-reads `room` / `viewer` on every poll (`describeRoom` per GET); read them on the every-5th re-read only (contract 6.1). | CLOSE `:39`; S69 `:85`; BUILD `B4-repair.md:17,32` (finding 9c); `B4-review-edges.md:19-36` (F2: Lounge/Board 4-5 -> 10-11 PostgREST calls, event chat 17-18, old screens poll every 2 s); `integration-http.md:356` | D7 answers it: new screens poll `?after=` every 4 s and re-read room/viewer on the every-5th full page. The route keeps sending `room`/`viewer` (payload pinned); the contract may add a `?light=1` (or similar) so the 4-s poll skips `describeRoom`; otherwise accept the cost for v1 (clubs are tiny). |
| C2 | A grouped reply-count function in migration B; today `reply_count` walks reply rows (`count: "exact"` first page, up to 5 pages per 100 posts, null past the cap). | CLOSE `:40`; S69 `:85`; `B4-repair.md:20,33`; `B4-review-edges.md:38-43` (F3: PostgREST aggregates are off, so a real grouped count needs SQL); `src/lib/chat/message-read.ts:388-396` ("Wave 2: a grouped count in the database replaces the walk") | D3 answers it: migration B adds the function (service role; counts `removed_at is null`) and `readReplyCounts` calls it. Keep the walk as the missing-schema fallback. Note P4/`B4-repair.md:12`: the count must include the viewer's OWN removed replies (`removed_at.is.null,user_id.eq.<viewer>`), so the RPC takes the viewer id or the route adds the own-removed rows. |
| C3 | Sentences for the codes that have none (contract 14.9) and a code for `?after=` that is not a timestamp (today 400 "Invalid after", no code). | CLOSE `:41`; CONTRACT `:644` (14.9); `B4-notes.md:92` (judgement call 1); `integration-http.md:116` ("decision: 400 no code"); `src/lib/chat/types.ts:100-110` (the codes exist with no sentence), `:116-125` (eight sentences only); `message-read.ts:711`, `messages/route.ts:115` | D4 answers it: pin sentences for `not_found`, `not_allowed`, `report_open`, `invalid_card`, `event_not_found`, `poll_closed`, `slot_full`, `cards_club_rooms_only`, `members_only`, `create_failed` and a new `invalid_after` (400). Wave-1 routes that answer `not_found` / `members_only` / `create_failed` keep their own sentence (14.9). |
| C4 | `room_locked` doubles as the reserved-name refusal (creating a room named "Lounge" or renaming to "Board" reads "This room can't be renamed, hidden or deleted."). | CLOSE `:42`; S69 `:85`; `B1b-routes-repair.md:15` (rejected for B1b: contract point); `B1b-routes-review-http.md:57-59` (F3); `B5-repair.md:16`; `B5-review-design.md:43-46` (F6); `integration-http.md:355` ("copy only") | D8 keeps `room_locked` as the code for a reserved name (no create/rename screens in v1). Write it down as accepted for v1; a separate code is an after-launch item with the custom-rooms UI. |
| C5 | `POST …/channels/[channelId]/members` (the by-name allow-list) has no rule for event rooms / Board / Lounge: it answers 200 `granted: true` and writes an `org_channel_members` row that grants nothing there. | CLOSE `:43`; S69 `:85`; `B1b-routes-notes.md:52` (point 5); `B1b-routes-repair.md:14` (rejected: contract change); `B1b-routes-review-http.md:31-34,54-55` (F1; the three-line fix after `requireChannelStaff`) | D8 answers it: board, lounge, event -> 409 `room_locked`; officers and room as today; `kind` null keeps today's behaviour. The fix is "three lines after `requireChannelStaff` in POST" (`B1b-routes-repair.md:14`). |
| C6 | `CampusMobile.tsx` still titles club rooms `# name` in its own drill-down and sends `type: "org"` with no `room_kind` / `can_post`. | CLOSE `:44`; S69 `:85`; `integration-http.md:359`; `B5-review-coverage.md:31`; `src/components/mobile/CampusMobile.tsx:2459-2464` (`synthesizeChannelThread`, `name: \`# ${c.name}\``) | D5: with the flag on the phone Campus > Chat pill is not rendered and `?tab=chat` redirects to `/messages`, so the drill-down is unreachable; with the flag off it stays as is until after launch (W0 `:16`, call 8). No edit to the `#` title in wave 2. |
| C7 | A demoted officer who was also added to Officers by name keeps that room (decision 27 keeps the by-name list). | CLOSE `:45`; CONTRACT `:664` (15, "For Franky, not blocking"); `B1a-review-security.md:58-59` (F3); `B1a-repair.md:66` (finding 30 rejected: Franky's call); `B1a-review-triggers.md:19` | Default: leave it (removing someone from Officers stays a by-hand step for the owner). List it in the wave-2 contract's open points with that default; no code. |
| C8 | Old nested-button hydration warning in `CampusMobile` FeedCard (seen in the browser walk; not wave 1). | CLOSE `:46`; S69 `:79` | Not chat. Leave it; note it for the after-launch clean-up of `CampusMobile.tsx`. |
| C9 | Blocking inside club rooms against a DIRECT database read (PostgREST with the anon key), not only in the routes. | S69 `:85`; CONTRACT `:665` (15, "For the wave 2 contract"); `B1a-repair.md:69,86` (finding 33); `B1a-review-security.md:38,67-68` (F6b: `messages_select_org_member` would need a block arm with the Board exception); `B1a-review-rollout.md:64` (F7) | D2: NOT in v1; written down as an after-launch migration with the exact clause (`NOT public.is_blocked_either_way(auth.uid(), user_id)` except top-level Board posts by current officers). |
| C10 | The stub's exact shape for `hidden: true` (what `content`, `user_id`, `users` hold) and whether the officer Board-post exception is confirmed (Franky's relayed sentence "you shouldn't be able to see their messages still" vs contract 12.2's exception). | CONTRACT `:608` (12.2: "Still to pin in the wave 2 contract"); `B0-notes.md:6,45,59`; `B0-review-contract.md:31-35` (F2); `B0-review-logic.md:54-56` (F8); `B0-review-move.md:36-45` (F1); `B0-repair.md:16,24-25,86`; `B0-gate.md:183-185`; `B1a-review-sql.md:83`; `B1a-review-rollout.md:93` | D1 pins the stub (`content: ""`, `user_id: ""`, `users: null`, `card: null`, everything else at its default, kept in the array) and keeps the officer Board-post exception; W0 `:56` records Franky's own call with the exception ("Both ways ... One exception: an officer's Board post shows to every member"), which is later than the relayed sentence the B0 reviewers saw. List the exception as an open point with D1 as default so Franky can strike it. |
| C11 | `POST /api/orgs`: when the owner's `org_members` insert fails the club is kept with no owner and no rooms (`chat_repair_club` runs only after the owner row). Pre-existing, outside the wave-1 hunk. | `B1b-routes-repair.md:13` (finding 6, rejected: not the owned hunk); `B1b-routes-review-security.md:43-46` (F3); `integration-http.md:354` ("Yes, still open"); `src/app/api/orgs/route.ts:886` | Small, not chat-specific: whoever next owns `POST /api/orgs` deletes the club before `fail(500, "create_failed", "Failed to add owner row")`, as the rooms branch does. Optional for wave 2. |
| C12 | "You'll appear in the event chat." shows only for members (repair applied: `readMyClubIds()` + `useIsMyClub`, hidden while unknown); a club joined or left on the same page shows after a reload. | `B5-repair.md:14`; `B5-notes.md:65`; `B5-review-design.md:22-25` (F3, withdrawn after the decision) | Nothing for wave 2 unless the stretch goal (non-members in event rooms, CONTRACT section 9) ships; then the line is true for everyone and the member check goes. |
| C13 | The 201 of `POST …/channels` and the 200 of `PATCH …/channels/[id]` carry no `kind`; a screen that puts the answer straight into its list holds a row without `kind` until it reloads. | `B1b-routes-notes.md:50` (point 3); `B1b-routes-repair.md:18`; `integration-http.md:358` ("optional") | No wave-2 screen creates or renames rooms (custom-rooms UI is after launch), so nothing needed. If `GET /api/orgs/[slug]/space` is built from the same row shape, read `kind` from the list, not from a write's answer. |
| C14 | Names are unique per club against event rooms too (an event titled "formal" blocks a room named "formal"; the old list cannot show why). Accepted as built. | `B1b-routes-notes.md:51` (point 4); `B1b-routes-review-contract.md:52-61,82` (finding 3, first half accepted); `B1b-routes-review-http.md:23-29,49-52` (F2, `.maybeSingle()` half fixed with `.limit(1)`); `integration-http.md:344` (note 1) | Accepted for v1 (orchestrator, S69). No wave-2 work; the after-launch custom-rooms UI may show event rooms in the clash message. |
| C15 | `GET /api/me/threads` non-member answers keep the route's old text ("Not a member", `{ok: true, already: true}` on decline) with no club-room code. | `integration-http.md:346` (note 3); `B1b-core-notes.md:16` | Accepted for v1 (the caller cannot see the room, so the route never learns it is a club room). The wave-2 reads (`inbox`, `space`) answer 403 `members_only` / 404 for the same people (CONTRACT `:515`). |
| C16 | Three gate-2 cases that migration A's check could only do at SQL level (create an event, RSVP, cancel) must run over HTTP after any migration. | CONTRACT `:657` (15.8); `B1a-verify.md:102`; `B1a-repair.md:92`; `integration-http.md:19-33` (done for wave 1: 11 steps) | The Mac repeats them after migration B (section 4 of this file lists the exact steps). |

---

## 2. Decisions and defaults already made that constrain wave 2 (with the document that made them)

### 2.1 Franky's calls (final for v1) — `wave-0-decisions.md`

| # | decision | where |
|---|---|---|
| F1 | Names: **Board + Lounge**; Officers is the private room; "Your hat" = the role (Owner, Officer, Mod, Member); custom titles after launch. | W0 `:9`, `:43`; CONTRACT `:36-47` (section 1) |
| F2 | Board replies: **yes, folded under the post, never notify**; an @mention inside a reply still notifies that one person if they can read the room. | W0 `:10` |
| F3 | Event room membership v1 = **club members with Going/Maybe + the club's officers**; the model must fit non-members from day one; "anyone who RSVPs" is a stretch goal before Oct 15 only if everything else is built and walked, else after launch (officer switch per event, off by default, plus the seven checks of CRITIQUE #3). | W0 `:11`; CONTRACT section 9 (`:552`) |
| F4 | Who's going is **visible inside the club's event room**; outside it stays counts only; the Going button says "You'll appear in the event chat". Counts "from 5 up" NOT in v1. | W0 `:12`; CONTRACT `:613` (12.11) |
| F5 | SAE: `general` -> Lounge (public), `exec` -> Officers. Done on production Sept 30 (3 old messages in the Lounge). SAE's owner is Franky. | W0 `:13`, `:42`; S69 `:89` |
| F6 | **Sign-ups show names; polls show names by default with an "anonymous" switch (counts only).** | W0 `:14` |
| F7 | Event room life: **from the event's creation until 7 days after it ends**; Soon / Live / After computed at read time; read-only after 7 days; no stored `opens_at` / `archives_at`. | W0 `:15` |
| F8 | Phone Campus > Chat pill **removed when `chat_v2` is on**; the club page's Chat button and old `?tab=chat` links open Messages (phone only); desktop keeps Campus > Chat. | W0 `:16`; CONTRACT `:531` (URLs) |
| F9 | **Owners, admins and mods can remove a message** in their club's rooms (soft remove, never on a message with an open report); Officers stays owner + admin + the allow-list; only owners/admins post top-level on the Board. | W0 `:17`; CONTRACT `:466-472` (6.3) |
| F10 | After launch (accepted, nothing built now): up to 3 custom rooms per club; notifications default "Board + mentions"; "seen by" = a count for officers from 5 up; desktop Messages rebuilt as a three-column React page. | W0 `:18` |
| F11 | Blocking inside club rooms: **both ways**; neither sees the other's messages, nor the other's name in polls, sign-ups and "who's going"; counts unchanged; **one exception: an officer's Board post shows to every member**. Built with the room screens; wave 1 only reserves the field. | W0 `:56`; CONTRACT `:608` (12.2) |
| F12 | People who already RSVP'd (7, all testers) join event chats without having seen the Going line: **accept**. | W0 `:55`; CONTRACT `:607` (12.1) |
| F13 | New chat on for everyone **Mon Oct 26, when doors open** (not launch day). | W0 `:41`; CLOSE `:7` |
| F14 | Roadmap v14 published (chat redesign dates on it; James and Rylan see it). | W0 `:40`; S69 `:27` |

### 2.2 Orchestrator defaults (set in wave 0, "say so if wrong") — W0 `:21-28`

- Cards (polls, sign-ups, RSVP cards) are **club rooms only** in v1, not in DMs or groups (CRITIQUE #26) -> the `cards_club_rooms_only` code (`types.ts:107`).
- **No Headcount card**, no Bring / Rides tiles, no "I'm here", no album (CRITIQUE #18).
- **No photos in club or event rooms** in v1 (location stripping first, CRITIQUE #23) -> `club_media_off` on send and upload-url (live since wave 1).
- **No `board_post` notification rows**; the inbox's coral Board dot is the signal (CRITIQUE #16).
- **Push stays out** of this plan (CRITIQUE #9).
- Messages home filters **Chats · Clubs · Requests**, "Your week" this week only (CRITIQUE #20, v1 cut). Requests kept as the safety buffer (CONTRACT `:530`).

### 2.3 Contract section 12: open points with defaults (CONTRACT `:603-621`)

| 12.x | point | default (constrains wave 2) |
|---|---|---|
| 12.3 | Rank rule for removing messages (mod cannot remove owner's/admin's; admin cannot remove owner's). | **Keep the rank rule** -> `outranks` in `room-rules.ts:67`; 6.3 order: role check first, then `outranks` (CONTRACT `:645`, 14.10). |
| 12.4 | The 3-room cap. | Out of v1. |
| 12.5 | A removed message is still shown to its own sender (existing RLS). | New screens label it "Removed by a club officer." or "Removed by Vibe moderators" -> `RemovedContentCard` `by` prop (D9). |
| 12.6 | Sender's own delete stays a hard delete, also with an open report; it erases the trace of an officer's removal. | Unchanged in v1. |
| 12.7 | Deleting an account deletes other people's chat (`events.creator_id` cascades; a Board post's author takes the replies). | Accept for v1; after launch `events.creator_id` -> SET NULL. |
| 12.8 | Anonymous polls with very few voters show counts from the first vote. | Accept for v1. |
| 12.9 | Every club room in the OLD inbox for every member after the backfill. | Accept (the rows are what the new inbox needs). Live since Sept 30. |
| 12.10 | Club creation failing on its rooms deletes the club. | Yes (built: `orgs/route.ts:869`, `:912-916`). |
| 12.11 | Event counts "from 5 up". | Not in v1. |
| 12.12 | The 2 messages in `test-f7ae4129 / announcements` by a non-officer. | Leave them. |
| 12.13 | `closes_at` on polls: in the model and the API, no picker in the v1 mockups. | Keep the column; **v1 screens send null**. |
| 12.14 | Custom titles. | After launch. |
| 12.15 | The Going line ships in wave 1 (live). | Done. |
| 12.16 | The four AFTER triggers swallow their own errors. | Yes; `chat_repair_club` repairs; the warning is in the database log. |

### 2.4 Decisions written after the batches (CONTRACT 14-16) that wave 2 code must honour

- **Gates on the branch** (14.1, CONTRACT `:636`): `npm run typecheck` repo-wide, `npm test` (1,374), `npx eslint <the batch's files>` exit 0; 32 old lint errors in 11 component files are not the batch's to fix (`B0-gate.md:19-30` lists the 11 files; `MessagesMobile.tsx` 3 errors, `CampusMobile.tsx` 4). The rule came out of three B0 gate rounds that could not pass "all three commands green" (`B0-repair.md:61`, `B0-gate.md:176-182`).
- **Line numbers in the as-is moved** (14.2): `messages/route.ts` references past line 42 are ~162 too high; the moved pieces are `message-read.ts:31-188`; `channel-access.ts` +5 after the `ChannelAccess` type. (After B4 `message-read.ts` is 1,078 lines and the route 230+ lines; read the file, not the asis numbers.)
- **`rooms.ts` signatures** (14.4) and **`canPostAnswer`** (16.1, CONTRACT `:668`): routes call `canPostAnswer`; "failed" -> 503 `try_again` and `postRefusal` is not called; "no" -> `postRefusal`; "yes" -> send. Verified: `src/lib/chat/rooms.ts:189,219,260-266`.
- **`postRefusal` fallback** = `room_closed` for any refusal the 6.2 table does not name (14.5).
- **B0 helper behaviour** (14.6): the flag list readers answer no while the switch is off (`flag.ts:64,74,91`); `isMissingChatSchema` judges an error with a code by the code alone (`schema.ts:43-44`); `roomState` answers `closed` for a date string without a zone (`room-state.ts:20-21,41`) -> **never re-format event dates; pass the timestamptz string as the database sent it**; `refusalBody(code)` always carries a sentence (falls back to `try_again`, `types.ts:141-142`).
- **Names B0 exports beyond the contract** (14.7; `B0-notes.md:27`): `isRoomKind`, `isClubRole`, `refusalBody`, `chatV2MayRunHere`, `ThreadRoom`, `RemovedInfo`, `ThreadEntryRoomFields`, `CalendarRoomFields`, `RefusalCode`, `PostRefusalCode`, `ChatRouteCode`, `ChatErrorCode`, `Refusal`, `FeaturesResponse`, `CreateCardResponse`, `VoteBody`, `VoteResponse`, `PollCardOption`, `MessageKind`, `RemoveMessageResponse`, `InboxResponse`, `SpaceRoom`. Use them; do not re-declare.
- **`Person.handle` / `Person.name` are `string`** (14.8); B4 read both NOT NULL locally (`B4-notes.md:13`).
- **Remove route order** (14.10): the role check runs before `outranks`; `outranks` alone answers false for any caller below mod (`B0-review-contract.md:49-51`).
- **`ensureMember` carried a `kind` and `loadRoom` answered null = the read failed -> 503 `try_again`** (16.2); `kind` null = a database without the chat schema; `isOrgChannel` false = dm or group.
- **`thread_root_id` is cleaned once** (trim; blank = no root) and that value goes to the gate, `postRefusal` and the insert; present-and-not-text -> 400 `thread_root_not_allowed` (16.3).
- **`canPostAnswer`, `canPost`, `filterRoomReaders` are for club rooms only**; for a dm or group the route sets `viewer.can_post` true itself (16.4).
- **A failed read in `loadRoom` / `filterRoomReaders` / `clubRole` answers null / leaves the person out / null and is logged; none throws** (16.5).
- **Migration A facts that migration B must copy or respect** (15.1-15.8, CONTRACT `:649-657`): `chat_rsvps_room` fires on ANY update; `chat_repair_club` has six steps (5 deletes, 6 sets `accepted_at`); the 7 days are counted in UTC (`set timezone to 'UTC'` on three functions); the after-deploy check has eight lists; everything the person applying must see is returned by a query, never a NOTICE (PRE-CHECK queries in the header, apply record in the comment of `chat_repair_club`); the behaviour probe may skip; `chat_channels_fill_kind` follows 3.4 literally; three gate-2 cases are SQL stand-ins for a route.
- **B4 judgement calls kept as built** (`B4-notes.md:90-101`, `B4-repair.md:24-28`): `?after=` bad -> 400 "Invalid after" no code (wave 2 adds the code, C3); `?root=` default limit 200; any `media_url` to a club room -> 400 `club_media_off`; an RLS refusal after the gate said yes re-asks `canPostAnswer` once ("no" -> `postRefusal` code; "yes"/"failed" -> 500 logged CONTRACT BUG); a failed `can_post_org_channel` on GET -> 503 `try_again`; the send's answer (`message`) is a `ChatMessage`; on a database without the columns a non-reply message is re-sent WHOLE; upload-url runs the club-room guard before the R2 storage check.
- **B1b decisions kept as built** (`B1b-routes-repair.md:18`): a `name` / `is_private` equal to the room's own value on a core room is not a change (not refused, not written); 401 / 403 "Admin only" / 404 "Channel not found" bodies keep no `code`; event titles count in the name-clash check; club creation's two-row fallback runs only when the FUNCTION is missing (PGRST202 / 42883), any other error deletes the club (500 `create_failed`).
- **B5 decisions kept as built** (`B5-repair.md`): the two desktop room modals and the club Settings > Channels editor hide rename / privacy / Delete on core rooms and show only "This event chat follows its event." on an event room; desktop `ChannelChat` seeds `can_post` from the list (no composer flash); the Going line is members only.

### 2.5 Plan-critique findings that shape wave 2 (CRITIQUE, by number)

| # | finding (severity) | what it fixed in the plan | where wave 2 meets it |
|---|---|---|---|
| 3 | Non-members via RSVP bypass the club rules (high): no home-campus / audience / officer-block / removal / school-verified / "public event" check on `PUT …/rsvp` (`:50-67`). | Non-member access cut from v1; the seven checks are listed for the stretch goal, re-checked on read. | NOT in wave 2 (D10). The `event_card` Going/Maybe calls the existing RSVP route; a non-member's RSVP writes no room row (gate 2, live). |
| 4 | Event rooms reveal who RSVP'd (high) (`:69-75`). | The Going line ("You'll appear in the event chat"), faces only inside the room; "N going" from 5 up became a call Franky put after launch. | `room.event.going` = first 8 room members (6.1, built: `readGoing`); counts outside unchanged; the Going line live since wave 1. |
| 8 | The "read-state privacy fix" was scoped to the wrong columns (high) (`:121-139`). | Restated; "not a v1 blocker unless seen-by or presence ships"; the settings-columns fix is NOT in v1 (CONTRACT `:22`). | Nothing in wave 2 (no "seen by", no Realtime). Known: every member reads co-members' `hidden_at` / `muted_until` / `last_read_at` on club rooms (`B1a-review-security.md:36,67`). |
| 9 | Applying the push migration in wave 1 was a separate decision (high) (`:141-153`). | Push removed from the chat plan; its migration needs renumbering. | Push still dark on production (CLOSE `:16`). Migration B's number `20261001110000` sits above `20261001100000`; the push file still needs its own renumber later. |
| 11 | Waves 2 and 3 all edit one 4,866-line `MessagesMobile.tsx` (medium) (`:185-196`). | Open wave 2 with an extraction-only batch; then one batch per wave owns `MessagesMobile.tsx` (navigation/deep link); new screens in new files; each batch owns its own states, Light, Night, 375px; its slot goes to the `CampusMobile` Chat retirement and the `?tab=chat` redirect. | D6 (the split runs alone; proof = `wave-2-build/tools/split-check.mjs`), D5, D10, D11. The file is 4,985 lines today (`wc -l`), not 4,866. |
| 12 | Board replies would leak into the Board as posts (medium) (`:198-208`). | `board_post` dropped from `messages.kind`; a Board reply is `thread_root_id`; 409 for a missing root; Board reads filter top-level and return a reply count; replies go with the post; mentions inside replies still notify. | Live: `board_post_missing` 409/404, `reply_count`, `?root=`; the cascade takes replies (`B1a-verify.md:74`). Wave 2 renders the fold. |
| 13 | Side tables leak voter names and cannot enforce their rules (medium) (`:211-224`). | Votes and claims get zero client grants; writes through SECURITY DEFINER RPCs (`create_card`, `cast_vote`, `claim_slot`) that refuse inside, one transaction each, `claim_slot` with `SELECT … FOR UPDATE`; unique(poll, user) when not multi; no edits after the first vote; sign-up = poll with `mode='signup'` and a capacity per option. | Migration B (CONTRACT section 4, `:273-338`); D3. |
| 15 | Mentions in club rooms notify people who cannot read them (medium) (`:241-246`). | Targets filtered with `can_view_org_channel`. | Live: `filterRoomReaders` (`B4-notes.md:82-84`). Card routes that accept @mentions must call it too. |
| 16 | B5 (notifications) too narrow (medium) (`:248-256`). | v1: no `board_post` notification rows; the coral Board dot is the signal; settings later. | `InboxClub.board.unread` (CONTRACT `:504`) is the dot's source. |
| 18 | The `events` table cannot feed the room design (medium) (`:268-280`). | Rooms are club-only, created in `POST /api/events` (now: by trigger), Soon/Live/After at read time, v1 tiles = Where and When, the cover is the club banner; Bring / Rides / "I'm here" / album cut. | Event chat screen (W0_Room mockup) reads `room.event` from the thread GET (6.1). |
| 20 | The Option 3 inbox drops message Requests (medium) (`:294-296`). | Requests kept as a filter chip or row. | Messages home: All · Chats · Clubs · Requests (D10); `?scope=chats` still carries `requests` (6.4, live). |
| 23 | Photos in club rooms keep location data (medium) (`:315-319`). | Photos off in club and event rooms in v1. | `club_media_off` live; the "+" tray has no photo item (D10 "NOT in wave 2: photos in club rooms"). |
| 26 | Room kinds for DMs and groups (low) (`:339-342`). | `kind` NULL for dm/group with a CHECK; cards not in group chats (W0 default). | `cards_club_rooms_only` code; card routes refuse a dm/group before anything else (CONTRACT 4.4). |
| Smallest v1 (`:367-401`) | The three must-haves: Board/Lounge + folded replies + the inbox dot; club-only event chats for members with Going/Maybe + officers, Where/When tiles, open until end + 7 days; one `chat_polls` model with `mode poll|signup` + an RSVP card calling the existing RSVP route; plus a compact Messages home (Chats · Clubs · Requests, this week only), officer/mod soft-delete, report snapshots with cards, desktop compatibility only, everything behind `chat_v2`. After launch: month sheet, week swiping, non-member event rooms, custom rooms and pinning, photos, notification settings and push, "seen by" and Realtime, the React desktop Messages. | = D10's scope line for line. |
| Timeline (`:403-420`) | Oct 5-9 phone home and club space (flag on for founders + SAE; demo days show it to SAE only); Oct 10-14 event rooms and cards, sentinels, phone walk; Oct 15 freeze; launch = flag for everyone. Desktop keeps `messages.html` and Campus > Chat with the compat fixes. | Section 7 of this file. |

---

## 3. Reviewer findings of wave 1 marked "wave 2", "later", "for the wave 2 contract", "not blocking" or "accepted for v1"

Everything a wave-1 reviewer or repair left standing with one of those words, grouped by batch. Rows already in section 1 carry their C-number.

### B0 (shared foundation) — `B0-review-*.md`, `B0-repair.md`, `B0-gate.md`

| finding | verdict in wave 1 | for wave 2 |
|---|---|---|
| `hidden` cannot carry the stub Franky's answer needs; the stub's exact shape must be pinned before the rooms' screens wave (`B0-review-contract.md:31-34`, F2). | Comment fixed; shape "for the wave 2 contract" (`B0-repair.md:10`). | C10 / D1. |
| Contract 12.2's officer Board-post exception vs Franky's relayed sentence (`B0-review-move.md:36-45` F1 medium; `B0-review-logic.md:54-56` F8; `B0-review-contract.md:35`). | "No B0 edit; ask Franky one question before the screens wave" (`B0-repair.md:16,25`; `B0-gate.md:183-185`). | C10: W0 `:56` already records the exception in Franky's own call; list it as an open point with D1. |
| `outranks` is stricter than 6.3's words at rank 0 (`B0-review-contract.md:49-51`, F6). | REJECTED, kept: "the wave-2 remove route still runs the `ROOM_MODERATOR_ROLES` check before it" (`B0-repair.md:14`). | The remove route follows 14.10 (role check, then `outranks`). |
| No pure helper for `chatV2For` (a new exported name) (`B0-review-logic.md:28-31`, F3). | "waits for the orchestrator" (`B0-repair.md:20`); never added. | Not needed unless a wave-2 screen test wants it; `chatV2For` stays server-only. |
| Nothing refuses the flag on Vercel Preview (`B0-review-logic.md:48-52`, F7). | "Real gap, changes what the contract says CHAT_V2_ENABLED means; needs the orchestrator's yes" (`B0-repair.md:24`). Later built: `chatV2MayRunHere` (`flag.ts:46`; CLOSE `:14,25` "off on Preview builds by design"). | Closed. A Vercel Preview never shows the new screens (section 7). |
| The thread read type marks `room`, `viewer` and the new message fields as always present; an old database sends none (`B0-review-contract.md:26-29`, F1). | Doc comment only; "screens read `viewer?.can_post`" (`B0-repair.md:9`). | Wave-2 screens run only with the flag on, on a migrated database; the 3.10 case is the old screens' problem. Still read `viewer?.` defensively. |
| Gate 1 red at HEAD (`parse-reminder.test.ts`, 32 lint errors) (`B0-gate.md:5-10`). | The test was fixed (`e085654`, S69 `:55`); lint judged per batch (14.1). | The rule for wave 2 (section 2.4). |

### B1a (migration A + seed) — `B1a-review-*.md`, `B1a-repair.md`, `B1a-verify.md`

| finding | verdict in wave 1 | for wave 2 |
|---|---|---|
| Blocks against a direct PostgREST read of club-room messages (`B1a-review-security.md:38,67-68` F6b; `B1a-review-rollout.md:64` F7). | "NO CHANGE in B1a; the direct-read question is for the contract of the wave that builds 12.2" (`B1a-repair.md:69,86`). | C9 / D2 (after-launch migration, clause written down). |
| A demoted officer with an allow-list row keeps Officers (`B1a-review-security.md:58-59` F3; `B1a-review-triggers.md:19`). | REJECTED as a change: "decision 27 keeps the allow-list; Franky's call" (`B1a-repair.md:66`); CONTRACT `:664` "For Franky, not blocking". | C7 (default: leave). |
| Every member reads co-members' settings columns on club rooms; the backfill created those rows (`B1a-review-security.md:36,67` F6a). | Known, CONTRACT `:22` "not in v1". | Nothing in wave 2 (no "seen by"). |
| `rsvps_update_own` lets a student move an RSVP onto an ended event or another club's event; no room access comes from it (`B1a-verify.md:105`). | Seen in passing, outside B1a. | Not chat. Note only. |
| Two writes at the same moment can each miss a `channel_members` row (`B1a-review-triggers.md:48-52` F3). | Wording only: the after-deploy check is run weekly and after any `chat-rooms` warning (`B1a-repair.md:59`). | The Mac runs `scripts/sql/chat-v2-after-deploy.sql` after migration B and weekly. |
| `chat_channels_fill_kind` turns a PRIVATE `general` into the public Lounge (`B1a-review-triggers.md:65-69` F5; `B1a-review-sql.md:59-65` F3). | REJECTED: "contract 3.4 says public; the file follows it" (`B1a-repair.md:61`); CONTRACT `:656` (15.7). | Only reachable in the apply window; nothing for wave 2. |
| The migrated local database had no CLOSED event chat (`B1a-review-seed.md:73-75` F9; `B1b-core-repair.md:30,42`; `B1b-core-review-behaviour.md:44-46` F5). | REJECTED for the seed; added by hand ("Chat Seed Closed Night", CONTRACT `:673` 16.6; CLOSE `:50`). | The local database on the Mac has it (id `61a0abae`, `integration-http.md:17`); the seed does not recreate it after a restore. |
| A shared-post attachment (`attachment_kind` / `attachment_id`) is still accepted in a club room (contract only bans `media_url` / `media_kind`) (`B1a-review-security.md:18`). | "Noted, not a finding". | Wave-2 screens: the "+" tray has Poll / Sign-up / Share an event only; sharing a post into a club room stays possible from the share pickers (B5 kept them, filtered on `can_post`). |
| The seed's "already migrated" path had never run (`B1a-review-seed.md:69-71` F8; `B1a-repair.md:38`). | Out of reach of the batch; for the orchestrator after the apply. | Ran on the Mac after the local apply (S69 `:59` "re-running the seed changes nothing"). |

### B1b (room helpers, channel routes, club creation)

| finding | verdict in wave 1 | for wave 2 |
|---|---|---|
| `canPost` (boolean) cannot say "the question failed"; 503 `try_again` impossible (`B1b-core-review-behaviour.md:18-21` F1 medium; `B1b-core-review-contract.md:22-33` finding 1). | FIXED with a new export `canPostAnswer`, needed the orchestrator's yes; given (CONTRACT `:668`, 16.1). | Card routes call `canPostAnswer` the same way (D10 "hydrateCards" batch). |
| `loadRoom` answers null for a failed read, a missing schema and a dm alike (`B1b-core-review-contract.md:42-47` finding 3). | FIXED in words: 16.2. | Every wave-2 reader applies 16.2. |
| Looser uuid check in `rooms.ts` vs `isUuid` in `ensureMember` (`B1b-core-review-contract.md:61-65` finding 6; `B1b-core-repair.md:28`). | Comment corrected; "say so if one rule in both files is wanted; two-line change". | Open, low. Card routes should use `isUuid` from `@/lib/pgrest` for ids they receive. |
| By-name list POST grants nothing on event / Board / Lounge (`B1b-routes-review-http.md:31-34,54-55` F1). | REJECTED "for now: contract change" (`B1b-routes-repair.md:14`). | C5 / D8. |
| `room_locked` sentence on a reserved name (`B1b-routes-review-http.md:57-59` F3). | REJECTED: contract point; "accept for wave 1, or a new code in wave 2" (`B1b-routes-repair.md:15`). | C4 / D8 (accepted for v1). |
| Club creation: "missing schema" from INSIDE `chat_repair_club` read as old database (`B1b-routes-review-security.md:18-22` F1 medium; `B1b-routes-review-contract.md:42-50` finding 2). | FIXED, "flagged for the orchestrator: if 3.10's literal test is wanted back, revert `noRepairFunction`" (`B1b-routes-repair.md:9`). | Section 6, diff X6. |
| A failed owner-row insert keeps a half-made club (`B1b-routes-review-security.md:43-46` F3). | REJECTED here: outside the owned hunk; passed on (`B1b-routes-repair.md:13`); `integration-http.md:354` "Yes, still open". | C11. |
| JSON `null` body -> empty 500 (pre-existing) (`B1b-routes-review-contract.md:69-73` finding 4). | FIXED in the six channel routes incl. `members` POST (`B1b-routes-repair.md:11`). | Card routes: parse the body the same way (null / non-object / array -> 400). |
| Event titles count in the room-name clash (`B1b-routes-review-contract.md:52-61` finding 3, first half). | ACCEPTED AS BUILT (orchestrator). | C14. |
| Unchanged `name` / `is_private` on a core room accepted (`B1b-routes-review-contract.md:29-40` finding 1). | WITHDRAWN: accepted as built; "the orchestrator adds one sentence to section 8" (never added to the contract text). | Section 6, diff X5. |

### B4 (thread routes and guards) — `B4-review-*.md`, `B4-repair.md`

| finding | verdict in wave 1 | for wave 2 |
|---|---|---|
| Polling cost of a club-room thread GET doubles / quadruples; old screens poll every 2 s (`B4-review-edges.md:19-36` F2 medium). | (a) one RSVP read and (b) the viewer's role from the authors' read FIXED (event room 17 -> 13 calls, Board 10 -> 9); (c) "the pinned every-5th-poll re-read is where the room description belongs" = a request to the wave-2 contract (`B4-repair.md:17,32`). | C1 / D7. |
| `reply_count` downloads every reply row; undercounts past 5,000 (`B4-review-edges.md:38-43` F3). | FIXED for now (null past the cap); "the grouped-count RPC is a wave-2 request (no SQL in this batch)" (`B4-repair.md:20,33`). | C2 / D3. |
| `?after=` with an impossible time answered 500 (`B4-review-edges.md:13-17` F1). | FIXED: `cleanAfterParam` checks the fields by its own arithmetic (`B4-repair.md:18`); `before` left as today ("contract: unchanged"). | Wave 2 adds the `invalid_after` code (C3 / D4); the check stays inside `readChatMessages` (`message-read.ts:711`), so the card routes inherit it. |
| `before` with `root` or `after` returned the oldest rows (`B4-review-edges.md:45-51` F4). | FIXED: a `before` page is always the newest rows before T (`B4-repair.md:21`). | The screens' "older" paging uses `before`; `after` is the poll. Never send both. |
| `readChatMessages` trusted its options (`B4-review-edges.md:55-59` F5). | FIXED: `clampReadLimit` and the `after` check run inside `readChatMessages` (`B4-repair.md:23`). | The card routes call `readChatMessages` / `readChatMessage` and get the clamps for free. |
| `room.event.going` could hold fewer than 8 while more were going (`B4-review-contract.md:53-55` P5). | FIXED: step-wise `readGoing` on the viewer's client; a failed read = the whole room 503 (`B4-repair.md:13`). | D1: blocked people are left out of `going` and the "first 8 going"; that filter goes into `readGoing`'s per-step user read (the viewer's client already hides restricted accounts the same way). |
| A DM or DM request could drop out of the old inbox behind club-room traffic (`B4-review-regression.md:27-37` F1 medium). | FIXED: two preview reads (dm+group ids, club-room ids) (`B4-repair.md:15`). | `GET /api/me/threads?scope=chats` (what the new home reads next to `/api/me/inbox`) never lists club rooms, so the window is DMs only there. |
| The upload-url route answered 503 "Media storage not configured" before the club guard (builder note, `B4-notes.md:59-60`). | Orchestrator decision: the guard moved ahead of the storage check (`B4-repair.md:26`). Live: `integration-http.md:151-167` (403 `club_media_off` on every club room, 503 on a DM locally). | Nothing. |
| `going_count` / `maybe_count` count every RSVP (service role) while `going` lists room members only (`B4-review-contract.md:66`). | "as 6.1 writes it" (checked, not reported). | The event chat header shows counts from all RSVPs and faces from room members; D1 keeps counts unchanged under a block. |
| List entries: `accepted_at` stays null on a club room whose `is_request` is false (`B4-review-contract.md:67`). | "the screens read `is_request` only; harmless". | New screens read `is_request` too, never `accepted_at`. `chat_repair_club` step 6 sets it back anyway (CONTRACT `:650`). |
| Decline with a malformed id answers 500 "Request failed" (committed route's answer) (`B4-notes.md:87`). | Not changed. | Not wave 2's. |

### B5 (old screens) — `B5-review-*.md`, `B5-repair.md`

| finding | verdict in wave 1 | for wave 2 |
|---|---|---|
| The create / rename forms show the `room_locked` sentence for a reserved name (`B5-review-design.md:43-46` F6). | REJECTED for B5: "accept for wave 1, or pin a separate code and sentence in wave 2" (`B5-repair.md:16`). | C4 / D8: accepted for v1. |
| The Going line is shown to non-members for whom it is not true (`B5-review-design.md:22-25` F3; `B5-review-coverage.md:12`). | Withdrawn after the orchestrator's decision; repaired members-only (`B5-repair.md:14`). | C12. |
| `messages.html` handlers behind the hidden buttons have no `roomKind` guard; only the buttons call them (`B5-review-coverage.md:15`). | Low, left. | Desktop untouched in wave 2 (D5). |
| The phone share sheet's "#" and "Channel" are old wording; 10.8 bans NEW Discord wording only (`B5-review-design.md:35`). | Fixed anyway for club-room rows (`B5-repair.md:3-4`); "#" stays only for a row from a server without the chat schema. | The new Messages home replaces the old list with the flag on; `SharePostSheet` stays shared. |
| Quiet-line contrast under 4.5:1 in Light (`B5-review-design.md:12-15` F1). | FIXED with `--ink-2` / `--soft`. | New screens: the same rule (4.5:1 for the quiet line and refusal copy, both themes; CONTRACT `:532` accessibility). |
| `ChannelChat` showed the live composer on a Board until the first read (`B5-review-regression.md:16` R3). | FIXED: seed `can_post` from the list; phone `ConversationView` keeps `canPost` null (empty bar) until the read (`B5-repair.md:13`). | D5's skeleton-until-the-flag-answers follows the same "never one then the other" rule. |
| `CampusMobile`'s synthesized thread (`type: "org"`, `# name`, no `room_kind`) (`B5-review-coverage.md:31`). | Fixed on the ConversationView side (`clubRoom` true for any type but dm/group). | C6. |

### Integration pass — `integration-http.md:342-360`, "Notes" and "Requests between batches"

| item | verdict | for wave 2 |
|---|---|---|
| POST a room named after an event room's title could not be reached with the seed (titles have spaces; the old name regex answers 400 first). | Not a failure; B1b showed the clash with `w1test-dup` (`:344`). | None. |
| drew (no club, unverified email) cannot send anything (403 `school_email_required` before any chat rule); the verified non-member cases use blake on SAE's rooms (`:345`). | Note. | The Mac's wave-2 HTTP pass uses the same trick (blake on SAE for "verified non-member"). |
| The Officers room is in nobody's old inbox (no rows), so "· Officers" cannot be seen over HTTP (`:347`). | `clubRoomLabel` covered by B0 unit tests. | `GET /api/orgs/[slug]/space` lists Officers "only if I can enter" (CONTRACT `:522`): the Mac checks it there. |
| Missing-schema answers (3.10) cannot be reached over HTTP on a migrated database (`:348`). | Stub harnesses covered them (B1b, B4 notes). | Same for wave 2: the card routes' 3.10 rows (CONTRACT 4.4) need a stub harness or a read of the code, not HTTP. |
| B5 -> B1b: POST 201 / PATCH 200 without `kind` (`:358`). | Still true, optional. | C13. |

---

## 4. The HTTP integration pass of wave 1 (what was validated, how, and what the Mac re-runs)

Source: `handoffs/chat-redesign/wave-1-build/integration-http.md` (370 lines; verdict PASS `:3`) and its running log `notes.md` (32 lines). `matrix-table.md` (226 lines) is the same 8 tables (185 MATCH rows + 1 N/A) copied out for the report. Setup: dev server `http://localhost:3100` on the working tree, the LOCAL database (migrated, seeded), the five seed accounts avery (owner), emery (admin), casey (mod), blake (member), drew (in no club, school email unverified) (`integration-http.md:5`). Scripts and raw answers live in the Mac session's scratchpad `wave1/integration/` (`notes.md`, `out-*.tsv`, `get-*.json`, `threads-*.json`), NOT in the repo (`:5`).

### 4.1 What was validated (`integration-http.md:7-15`)

| part | what | count | result |
|---|---|---|---|
| 1 | Event create -> RSVP (going / maybe / delete / non-member) -> messages -> cancel, over the real routes (`POST /api/events`, `PUT /api/events/[id]/rsvp`, `DELETE /api/events/[id]`), checked in SQL after each step (`:19-33`) | 11 steps | all as the contract (room + officers' rows on create; blake's row follows his RSVP; drew's RSVP writes no row; cancel leaves events/channels/rows/messages/rsvps at 0 and 3 `event_cancelled` notices) |
| 2 | Refusals and allowed cases: 6.2 POST messages (59), 6.1 GET `?root` / `?after` (10), 6.6 leave + 15 decline + DM leave (23), 6.7 upload url (16), 8 channel list/create (17 + 1 N/A), 8 PATCH (28), 8 PATCH/DELETE/reorder (28), 8 club creation (4) (`:35-265`) | 186 requests | 185 match, 1 unreachable with the seed (`:346`); every refusal carried the exact 6.0 sentence (`:37`); no refused send wrote a row (`:39`) |
| 3 | Thread GET, every `ThreadMessagesResponse` field and type through a validator (`validate.mjs`), per room x role: Board, Lounge, Officers, GAME (soon), COOKOUT (after), CLOSED (closed), SAE room (kind room), SAE Officers, 2 DMs (`:275-300`) | 27 reads | all OK; `viewer` matrix per role recorded (`:281-295`) |
| 3b | `GET /api/me/threads` against the database for 5 accounts, with and without `?scope=chats` (`:303-312`) | 10 lists + 1 pending club row | all OK; event rooms never listed; labels "<club> · Board|Lounge|<room>"; club rows carry `org`, `room_kind`, `can_post`; `?scope=chats` = DMs + `requests`; a club row with `accepted_at` null is a thread |
| 4 | A DM between two seed accounts: send, read, root refused, new request, kick refused, decline, leave, upload url (`:314-326`) | 8 steps | all OK; upload url 503 locally (R2 blanked in `.env.development.local`, `:327`) |
| 5 | SQL: `scripts/sql/chat-v2-after-deploy.sql` twice ("0 findings in 0 clubs; 12 clubs, 45 club rooms"), `scripts/sql/chat-v2-rooms-check.sql` (200/200, rolled back, 9 deliberate warnings) (`:331-334`) | 2 scripts | clean |
| 6 | Gates: typecheck exit 0; `npm test` 1,374/1,374; eslint on the 16 wave-1 route/lib/share files exit 0; `MessagesMobile.tsx` 3 errors / 1 warning = HEAD; `campus-home.tsx` 0 / 6 = HEAD (`:336-340`) | | green by the 14.1 rule |

Also checked on the side (`:267-273`): a pending club row (blake's Lounge `accepted_at` nulled through PostgREST) still lists as a thread and answers 400 `club_room` on decline; PATCH with a real change beside an allowed field writes nothing; the chat_seed_club snapshot is identical before and after section 8; an officer-style removal reads `removed: {by: "officer", at, reason: null}` for the author and hides the row from others (`:273`) — that is the shape `RemovedContentCard`'s `by` prop (D9) will render.

Groups: none exist locally and none can be made from the seed accounts (blake blocks casey; only avery has mutual follows) (`:329`); the group branch of the members route was judged by reading.

What it left in the local database (`:362-370`), all recognisable by `w1test`: 21 messages, the club `w1test_int_club` (+ `w1test_club`, `w1test_club2`, `w1test_club3`, `w1test_club_rev` from the batches), 4 `moderation_actions` rows, a `follow` notification, the DM `f128f961` with 0 members. The Mac's wave-2 pass will see these rows; the CLOSE handoff calls them "test rows named `w1test…`" (`:50`) and keeps pre-wave-1 backups under `handoffs/chat-redesign/wave-1-build/local-db-backups/` (`:51`; that folder is not in the cloud checkout: `ls` shows only `B1a-cost/` and `tools/`).

### 4.2 How the cookie tool works — `handoffs/chat-redesign/wave-1-build/tools/cookie.mjs` (27 lines)

- `node cookie.mjs <account>` prints a `Cookie:` header value for a LOCAL seed account; accounts avery, blake, casey, drew, emery; default blake (`:2-6`).
- It reads the local stack's `API_URL` and `ANON_KEY` from `supabase status -o env`, run with `cwd: "/Users/franciscocazares/vibe"` (`:8`) — the Mac path is hard-coded, so the tool is Mac-only as written.
- It refuses unless `API_URL` is `http://127.0.0.1:` or `http://localhost:` (`:12`, "refusing: not the local stack"), so it can never sign in against production.
- Sign-in: `POST <API_URL>/auth/v1/token?grant_type=password` with `email = <account>@example.test` and the seed password `vibe-local-1234` (`:13-17`; the S69 handoff says the password is in the seed script, `:63`).
- The session JSON is base64url-encoded with the `base64-` prefix into the cookie `sb-<project ref>-auth-token`; values over 3,180 characters are split into `.0`, `.1` chunks the way `@supabase/ssr` does (`:20-27`).
- Usage in the pass: `notes.md:3` names two helpers built on it, `q.sh` (psql read) and `c.sh who METHOD path [body]` (they live in the Mac scratchpad, not the repo). Browser sign-in without a password: memory `reference_live_verification.md` (Mac only, CLOSE `:52`).

### 4.3 What the Mac must re-run for wave 2 (derived from the pass and the carry-overs)

1. **Migration B**: `pg_dump` first; rehearse the copy with `commit;` -> `rollback;` (S69 `:13`); run the four PRE-CHECK header queries; then the real local apply; then `scripts/sql/chat-v2-rooms-check.sql` (expect "all 200 cases passed", 9 deliberate warnings) and `scripts/sql/chat-v2-after-deploy.sql` (expect 0 findings) to prove A still holds; then whatever check script B ships.
2. **The three route cases of 15.8 again** (create an event as an officer, RSVP as a member and as a non-member, cancel an event with 2 RSVPs and 3 messages) — they touch triggers B does not change, but the rule is "after any migration" (`B1a-verify.md:102`).
3. **The 6.2 / 6.1 tables** on the Lounge, Board, Officers, the three event rooms and a DM (the 59 + 10 cases of `integration-http.md:41-118`) to prove the card batch changed nothing for text sends and reads; plus the new rows: `POST …/cards` (poll, signup, event_card; per role; in a dm -> `cards_club_rooms_only`; on a Board as a member; in a closed room), `PUT …/vote` (single / multi / anonymous / closed / slot full / a blocked pair), the remove route (6.3: sender, mod, admin, owner, rank, open report, `already: true`), `GET /api/me/inbox`, `GET /api/orgs/[slug]/space` (hidden club 404, non-member 403 `members_only`, Officers listed only for owner/admin), `/api/me/calendar` (the three fields null with the flag off).
4. **The thread GET validator** extended for `card` (`PollCard` / `EventCard`) and for `hidden: true` stubs (D1's shape), per role and for a blocked pair (blake blocks casey in the seed: `B1a-review-seed.md:26`, `B4-review-regression.md:15`), so the block cases are reachable without new fixtures.
5. **The flag**: `GET /api/me/features` with `CHAT_V2_ENABLED=true` + allowlist / clubs set locally (D5's screens read it once per mount); the 404 of the gated reads with the flag off.
6. **The browser walk** at 375px in Light and Night as a plain member (blake) and an officer (avery): Messages home (four filters + Your week), club space (Board, Lounge, chips, Up next, the "+" tray), event chat, the three card renderers, the three empty states, Board replies folded; and, with the flag off, that nothing changed (the wave-1 walk list, S69 `:79`).
7. **Production**: PRE-CHECK queries, apply B at a quiet hour with the Management API recipe (`20260926100000_users_profile_layout.sql:74-85`, S69 `:83`), record the `schema_migrations` row, run the after-deploy check, merge to `main`, then set `CHAT_V2_ENABLED` / `CHAT_V2_ALLOWLIST` / `CHAT_V2_CLUBS` in Vercel **Production only** (CLOSE `:14`).

---

## 5. Gotchas learned in S69 (workflow resume, usage limits, Supabase MCP, canvas, and the smaller ones)

| gotcha | source | what to do in wave 2 |
|---|---|---|
| **Workflow resume replays by exact prompt text**: editing a prompt (even one blank line) re-runs that agent and can re-run everything after it. | CLOSE `:58` | To finish a half-done run, write a new small script for what is left instead of resuming an edited one. |
| **Usage limits cut two workflow runs mid-way**; builders told "an earlier attempt was cut off, read your notes and continue" picked up cleanly. | CLOSE `:59`; the second sittings in `B1a-repair.md:18`, `B1b-routes-notes.md:22`, `B4-notes.md:23`, `B5-notes.md:37`, `B1b-routes-review-contract.md:63`, `B1b-routes-review-http.md:36`, `B1b-routes-review-security.md:29`, `B5-review-coverage.md:23`, `B5-review-design.md:32`, `B1a-review-sql.md:86` | Every batch keeps a running log (newest at the bottom) and re-reads it on resume; reviewers whose first sitting was cut off re-verify rather than trust their earlier notes (`B1a-review-sql.md:87`). |
| **The read-only Supabase MCP role cannot call `can_view_org_channel` / `can_post_org_channel`** (permission denied, no crash) and cannot `set role`; check member rules over HTTP instead. | CLOSE `:60` | Production checks of the wave-2 RPCs (`create_card`, `cast_vote`, `claim_slot`) will hit the same wall: they refuse `anon` / `authenticated` inside and the MCP role is neither service role nor a member. Use HTTP as Franky (gstack browser, GET only, CLOSE `:54`) or the after-deploy query. |
| **The design canvas**: re-read `project/canvas.json` right before a publish (Franky edits it too; a note was resized mid-session and the second publish was merged onto his version). | CLOSE `:61`; S69 `:45` | Same for any wave-2 mockup change on canvas row 7 (`boards/W0_*.dc.html` are the sources). |
| **The roadmap page**: rebuild from `#page-source`, never from the rendered page; the published page sits in a cross-origin frame (the browser pane can look, not scroll or click). | S69 `:46` | Only if the roadmap changes again. |
| **Subagents leave local preview tabs open** in the browser pane; close them when the tab cap is hit. | S69 `:47` | Mac only. |
| **`$w$$w$` inside a `$$` block ends the block**; empty constants are written `''`. Policy / function fingerprints are pasted by script from the catalog, never typed. | `B1a-notes.md:16`; `B1a-repair.md:14` | Migration B's PRE-FLIGHT constants (the two function md5s of A, the policy texts) are copied the same way — but only the Mac can read the catalog; the cloud writes the file with the header's values (CONTRACT `:653`, 15.5 "After this file" fingerprints) and leaves the empty-constants bootstrap run to the Mac. |
| **An inline subquery in the same statement as a write does not see the write**; reads after writes go through `pg_temp` helpers. | `B1a-notes.md:21` | For B's check script. |
| **PostgREST only sees committed schema**: the seed's "already migrated" path could not run in the same batch as the migration. | `B1a-notes.md:47`; `B1a-repair.md:38` | Any seed change for B (poll fixtures) can be written in the cloud but only proven after the Mac's apply. |
| **RAISE NOTICE never reaches the person applying through the Management API** (JSON only). | `B1a-review-rollout.md:9,18-21`; CONTRACT `:653` (15.5) | Migration B returns everything by query (PRE-CHECK header + apply record in a function comment), as A does. |
| **`timestamptz + interval '7 days'` is computed in the session TimeZone**; PostgREST accepts `Prefer: timezone=`. | `B1a-review-sql.md:93-99` (N1); CONTRACT `:651` (15.3) | Any B function that touches `closes_at` or the 7-day window carries `set timezone to 'UTC'`. |
| **Node v25.9.0 on the Mac**: an extension-less relative import in a `.test.ts` fails with ERR_MODULE_NOT_FOUND (`parse-reminder.test.ts`, fixed in `e085654`). | `B0-gate.md:34-37`; S69 `:55` | New tests import with the `.ts` extension. |
| **`npm run lint` repo-wide is red (32 old errors in 11 component files)**; the gate is `npx eslint <changed files>`; compare with `git show HEAD:<path> \| npx eslint --stdin` for a file that carries old errors. | `B0-gate.md:19-30`; `B5-gate.md:6-7`; `B4-gate.md:5` | The split's gate: `MessagesMobile.tsx` may keep its 3 old errors (same rules), the new `messages/*.tsx` files 0. |
| **Nested `.maybeSingle()` on 2+ rows answers PGRST116 with `data: null`**; read the error, or use `.limit(1)` and test the array. | `B1b-routes-review-http.md:27,50`; `B1b-routes-repair.md:7` | Card routes: never `.maybeSingle()` on a read that may match twice. |
| **PostgREST aggregates are off** (`pgrst.db_aggregates_enabled` not set), so a grouped count needs SQL. | `B4-review-edges.md:41-42` | C2 / D3. |
| **`supabase/config.toml:18` max_rows = 1000 locally**; a lower production `max_rows` would shorten pages. | `B4-review-edges.md:66-67` | The reply-count walk stops when it has seen the exact total (`message-read.ts:394-395`), so it is safe; B's RPC removes the question. |
| **Local `schema_migrations` stops at `20260926100000`** (19 later files applied but unrecorded); pre-flights read the catalog; local applies go through `psql -f`. | S69 `:41` | The Mac's B rehearsal reads the catalog, never `schema_migrations`. |
| **The seed re-dates its events on every run**, so a run on a later UTC day is not a no-op; run it the same UTC day as a rehearsal and the apply. | `B1a-review-seed.md:9,11`; `B1a-repair.md:31` | Same rule for B's local rehearsal on the Mac. |
| **Old screens poll the thread GET every 2 s** (`_miniMessenger.js:306`, `messages.html:1790`, `campus-home.tsx:16003`). | `B4-review-edges.md:28-29` | Wave 2's 4-s `?after=` poll (D7) is the cheaper one; desktop stays at 2 s (untouched). |
| **The push migration `20260924120000` is applied locally but not on production**, and billing `20260922150000` likewise; a wave migration tested locally must not depend on them. | CRITIQUE `:148`; `B1a-review-sql.md:124` (A checked: no dependency) | Migration B: the same grep before the Mac applies it. |

---

## 6. Where the built code differs from `wave-1-contracts.md` text (the notes admit it), with three verified against the code

The contract says of itself: "Where the file differs from the text above, the file is right and this section is the contract" (CONTRACT `:647`, section 15 header). The sections 3.x / 6.x / 8 / 14 texts were NOT rewritten afterwards (`B1a-repair.md:76` "the contract text is unchanged"; `B1a-verify.md:101` "The contract file still has the old wording"). The list below is what a wave-2 reader must know so that the older text does not mislead a builder.

| # | contract text (older) | what the code does (admitted where) | verified in the cloud |
|---|---|---|---|
| X1 | 3.4 row `chat_rsvps_room`: "AFTER INSERT OR UPDATE OF status OR DELETE". | Fires on ANY update; an update is "OLD leaves, NEW arrives", so a moved RSVP leaves the old event chat (CONTRACT `:649` 15.1; `B1a-repair.md:78`; `B1a-review-security.md:44-53` F1 HIGH; `B1a-review-triggers.md:32-40`). | **YES**: `supabase/migrations/20261001100000_chat_v2_rooms.sql:1180-1182` `create trigger chat_rsvps_room after insert or update or delete on public.rsvps`; the function comment at `:1052-1057` says "ANY update, not only 'OF status' (S69 orchestrator's decision ...; contract 3.4 names the narrower list)"; "OLD leaves" at `:1076`. |
| X2 | 3.4 `chat_repair_club`: four steps that only insert; 3.7.2 "nothing is deleted"; 3.10 after-deploy check "lists clubs without ..., events without a room, (member, public room) pairs with no row". | Six steps: (5) deletes rows that should not exist, (6) sets `accepted_at`; at the apply, step 7 stops if the repair would delete anything; the after-deploy script has eight lists (CONTRACT `:650,652` 15.2, 15.4; `B1a-repair.md:79-80`). | **YES**: migration `:1270` "-- 5. Rows that should not exist.", `:1297` "-- 6. A club-room row is never a pending request", `:1300` `set accepted_at = now()`; the function's comment at `:1309` ("Removes the rows that should not exist ... Sets accepted_at where a club-room row has none"); `:1583-1600` the apply guard ("club-room rows should not exist or are not accepted"). |
| X3 | 3.5: the functions carry `set search_path to ''` only. | `can_post_org_channel`, `chat_repair_club` and `chat_org_members_rooms` also carry `set timezone to 'UTC'` (CONTRACT `:651` 15.3; `B1a-repair.md:72,81`). | **YES**: migration `:978` (in `chat_org_members_rooms`, `:975`), `:1208` (in `chat_repair_club`, `:1205`), `:1368` (in `can_post_org_channel`, `:1365`): `set timezone to 'UTC'`. |
| X4 | 14.4 / section 8: `rooms.ts` exports four functions; `canPost(...)`: `Promise<boolean>` ("on any other RPC error it answers false and the route sends 503 `try_again`"). | A fifth export `canPostAnswer` answers "yes" / "no" / "failed"; `canPost` is folded from it; routes call `canPostAnswer` (CONTRACT `:668` 16.1; `B1b-core-repair.md:23`; `B1b-core-gate.md:47`). | **YES**: `src/lib/chat/rooms.ts:189` `export type CanPostAnswer = "yes" \| "no" \| "failed";`, `:219` `export async function canPostAnswer(`, `:260-266` `canPost` = `(await canPostAnswer(...)) === "yes"`; the route imports it (`src/app/api/me/threads/[id]/messages/route.ts:17`, per `routes-map.md`). |
| X5 | 8, PATCH bullet: for `board`, `lounge`, `officers` "`name` and `is_private` refused with 409 `room_locked`". | A `name` or `is_private` EQUAL to the room's own value (name compared trimmed, lower-case) is not a change: not refused, not written; only a real change is 409 and then nothing in that request is written. Built because the desktop settings modal sends every field on every save (`B1b-routes-notes.md:48`; `B1b-routes-review-contract.md:29-40` finding 1, withdrawn "accepted as built"; the sentence the reviewer asked the orchestrator to add to section 8 was never added). | **YES**: `src/app/api/orgs/[slug]/channels/[channelId]/route.ts:100-102` `const renamed = sentName !== null && sentName !== guard.channel.name.trim().toLowerCase(); if (renamed && kind !== null && (coreRoom \|\| isCoreRoomName(sentName))) return roomLocked(); if (coreRoom && typeof body.is_private === "boolean" && body.is_private !== guard.channel.is_private)`; unchanged name + privacy alone answers 400 "Nothing to update" (`:169`). |
| X6 | 3.10's table: club creation on a database without the schema is decided by `isMissingChatSchema(roomsErr)`. | The two-row fallback runs only when the FUNCTION is missing (PGRST202 / 42883, or a code-less error whose message names a function); 42703 / 42P01 / PGRST204 / PGRST205 delete the club and answer 500 `create_failed` (`B1b-routes-repair.md:9` "If the orchestrator wants 3.10's literal test back, revert the `noRepairFunction` lines"; `B1b-routes-review-security.md:18-22` F1 medium). | **YES**: `src/app/api/orgs/route.ts:912-916` `const noRepairFunction = isMissingChatSchema(roomsErr) && (roomsCode === "PGRST202" \|\| roomsCode === "42883" \|\| (roomsCode === "" && roomsText.includes("function")));`. |
| X7 | 6.1: `?after=` "that is not a timestamp" (no status or code named). | 400 `{ ok: false, error: "Invalid after" }` with no code; the check also refuses impossible fields (month 13, Feb 30) by its own arithmetic (`B4-notes.md:92`; `B4-repair.md:18`; `integration-http.md:116`). | **YES**: `src/lib/chat/message-read.ts:711` `if (!cleaned) return failed(400, "Invalid after");`, `src/app/api/me/threads/[id]/messages/route.ts:115`. D4 gives it the code `invalid_after`. |
| X8 | 14.9: ten codes "with no sentence yet". | `refusalBody(code)` falls back to the `try_again` sentence for those, so no body ever lacks `error` (`B0-repair.md:23`; CONTRACT `:641` 14.6). `REFUSAL_SENTENCES` has 8 entries (`types.ts:116-125`); `RefusalCode` lists 18+ (`:83-110`). | **YES**: `src/lib/chat/types.ts:141-142`. |
| X9 | 2: `CHAT_V2_ENABLED` "copies the push shape" (env string alone); the three list readers "each read one variable". | The readers answer no while the switch is off (`B0-repair.md:35`); `chatV2MayRunHere` refuses Preview builds (CLOSE `:14,25`). | **YES**: `src/lib/chat/flag.ts:46,54,64,74,91`. |
| X10 | 6.1 (draft wording copied into `types.ts`): `hidden` "someone I blocked" (one direction). | Both ways (12.2); the comment was rewritten; the stub's shape is D1's (`B0-repair.md:10`). | `types.ts:270` `hidden: boolean;` (comment not re-read here). |
| X11 | 6.4 says the co-member read "stays as it is"; 6.4 says nothing about two preview queries. | The old list's preview is read in TWO queries (dm+group ids, club-room ids), each `limit(ids * 5)` (`B4-repair.md:15`). | Not re-verified in the cloud (route file 800+ lines; see `routes-map.md`). |
| X12 | 6.3 says the remove route is "WAVE 2 or 3, with the button". | Nothing built; the only removal today goes through the platform-admin route, which writes a `moderation_actions` row (`B4-notes.md:70-75`; `integration-http.md:273` "officer-style removal ... through the admin route"). 6.3's route writes NO `moderation_actions` row (CONTRACT `:471`). | `RemovedContentCard` has no `by` prop yet: `src/components/safety/ReportSheet.tsx:658` (`export function RemovedContentCard({`), `:686` hard-codes "Removed by Vibe moderators". |
| X13 | 8: names unique per club ("Channel name already exists"); `.maybeSingle()` implied by the old code. | `.limit(1)` + array test; a clash read that fails (not missing schema) answers 500 "Failed to create channel" / "Failed to update channel"; event rooms still count (`B1b-routes-repair.md:7`). | Not re-verified line by line in the cloud. |
| X14 | 3.10 / 8: the desktop room modals "stay live until wave 4" with `chatRefusalLine` only. | B5 also hid rename / privacy / Delete on core rooms in the two modals AND the third editor (club Settings > Channels), and shows "This event chat follows its event." on event rooms (`B5-repair.md:10-12`). | Not re-verified (campus-home.tsx is 16,000+ lines). |
| X15 | Section 8's seed bullet (two clubs, rows the seed writes). | The seed no longer writes room rows for chat_seed_club's members (the migration's step 7 does), refuses to run after a rollback of A, skips the member's Board post on a migrated database, calls `chat_repair_club` per seeded club (`B1a-repair.md:31-37`); the Mixer sits 5 days back, not 7. | Not re-verified (`scripts/local-seed.mjs` is 929 lines). |

(X4 addendum, verified: `src/app/api/me/threads/[id]/messages/route.ts:17` imports `canPostAnswer`; `:379` asks it before the send; `:495` asks it again after an RLS refusal — the "re-ask once" of `B4-repair.md:27`. X9 addendum: `flag.ts:47` `env.VERCEL_ENV === "production" || env.NODE_ENV === "development"`, `:55` `CHAT_V2_ENABLED === "true" && chatV2MayRunHere(env)`.)

---

## 7. Schedule facts, and what the cloud session may and may not do

### 7.1 Dates (all from the two session handoffs and the critique's timeline)

| when | what | source |
|---|---|---|
| Sept 30, 00:10-00:13 UTC | Wave 1 LIVE: migration A applied on production via the Management API and recorded (`schema_migrations` max = `20261001100000`); `main` fast-forwarded to `e4f8916`; Vercel deploy success 00:12:40 UTC; after-deploy check 0 findings (5 clubs, 20 club rooms); `chat_v2` unset. | S69 `:87-93`; CLOSE `:3,28-35` |
| Sun Oct 4 | **f2**: the sending @connectvibe.app mailbox (Franky enters the Resend key in Gmail "Send mail as"). | CLOSE `:15`; S69 `:15` |
| Week of Oct 5 | **Wave 2 build** (this session) and **demo days** (SAE only sees the new chat; flag on for the three founders + SAE). | CLOSE `:7,14`; S69 `:15`; CRITIQUE `:416` |
| ~Oct 5 | D-U-N-S (paperwork, Franky). | CLOSE `:16` |
| Fri Oct 9 | **f9**: Android build; Android Studio is installed, its SDK is NOT (`~/Library/Android/sdk` missing): Franky opens it once, runs the setup wizard, accepts the licenses; then the first build. | CLOSE `:15`; S69 `:15` |
| Oct 10-14 | Event rooms and cards, the sentinels, the phone walk (critique's proposed schedule; the contract folded cards into the week of Oct 5, CONTRACT `:19`). | CRITIQUE `:415` |
| Thu Oct 15 | **Freeze** for submission; "anyone who RSVPs" is a stretch goal only before this date. | CLOSE `:7`; S69 `:15`; W0 `:11`; CRITIQUE `:418` |
| Fri Oct 16 | **App Store submission**; Apple's UGC rule (filter, report, block) must hold (CRITIQUE `:231`). | CLOSE `:15`; S69 `:15` |
| Oct 23 | Store links; the check on Rylan's 10 clubs (roadmap). | CRITIQUE `:94,408` |
| Mon Oct 26 | **New chat on for everyone, when doors open** (the flag flipped for all). | W0 `:41`; CLOSE `:7`; S69 `:15` |

Still open beside the chat (Franky's hands, not this session): paperwork (James's Oct 3 LLC amendment, EIN, D-U-N-S, the Sept 26 meeting outcomes); wave 6 journal entry (private file) + feature sentinel; f11 parked (no Supabase Pro); push still dark on production (its migration needs renumbering) (CLOSE `:16`).

### 7.2 The cloud block (CLOSE `:18-26`, verbatim in substance)

A cloud session has the repo and these handoffs, but NOT the memory notes, the local Supabase stack (Docker), the seed accounts, the signed-in gstack browser, Android Studio, or `.env.local` (no production access key).

- **Do in the cloud:** the wave 2 contract + plan critic (docs); the `MessagesMobile.tsx` split with no behaviour change; new screens, card renderers and pure logic built against `src/lib/chat/types.ts`; route code; migration B's SQL **written** but not run. Gates: `npm install`, `npm run typecheck`, `npm test`, `npx eslint <changed files>` (CLOSE `:22`).
- **Leave for the Mac:** running or rehearsing any migration, HTTP tests against a database, browser walks, the production apply, the merge to `main` (CLOSE `:23`).
- **Work on a branch** (e.g. `chat-v2-wave-2`), push it, and **never merge to `main` from the cloud**: `main` deploys to production, and code that needs migration B must not go live before migration B is applied (CLOSE `:24`).
- A Vercel Preview of the branch will not show the new screens: the `chat_v2` switch is off on Preview builds by design (Preview uses the production database) (CLOSE `:25`; `flag.ts:47`).
- End the cloud session by updating this handoff (or a new one) with what was built, what is left for the Mac, and the branch name; commit and push it (CLOSE `:26`).

What that means for the artefacts this session produces: `cookie.mjs` cannot run here (it shells out to `supabase status` with a Mac path, `tools/cookie.mjs:8`); the local-db backups named in CLOSE `:51` are not in the checkout; `scripts/sql/chat-v2-rooms-check.sql` refuses any database but the unix-socket local one (`B1a-repair.md:68`); nothing in section 4.3 can be started before the Mac session.

### 7.3 Flag rollout (CLOSE `:14`)

When the first new screen is ready: `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' user ids>`, `CHAT_V2_CLUBS=<SAE's org id>` in Vercel **Production only**. The star must be the whole value of the allowlist (`B0-repair.md:22`); a club entry that is not an id is dropped with one warning (`B0-repair.md:12`). On Oct 26: `CHAT_V2_ALLOWLIST=*`.

---

## 8. Surprises (the only opinions in this file)

- The B0 reviewers' worry that Franky's relayed sentence rules out the officer Board-post exception is answered by W0 `:56`, which records his own later call WITH the exception; the wave-1 notes never cross-reference it, so a wave-2 reader may re-open a closed question.
- `wave-1-contracts.md` sections 3.4, 3.5, 3.10, 8 and 14.4 still carry the older wording (X1-X6); only sections 15-16 correct them, and one accepted deviation (X5, unchanged `name` / `is_private` on a core room) is in no contract section at all.
- The contract (14.9) and `types.ts` reserve ten codes with no sentence, and `refusalBody` silently answers "Try again in a moment." for all of them; a wave-2 route that forgets to add its sentence will ship a wrong line without a type error.
- The `.maybeSingle()` trap (PGRST116 + `data: null` read as "no clash") is fixed in the channel routes but is a general pattern; the card routes' reads of `chat_polls` / `chat_poll_votes` will meet it again.
- `MessagesMobile.tsx` is 4,985 lines now, not the 4,866 the plan critique and the CLOSE handoff quote (B5 added ~120); the split tool `wave-2-build/tools/split-check.mjs` already exists in the checkout (commit `15a8286`).
- The cookie tool hard-codes `/Users/franciscocazares/vibe` as the `cwd` for `supabase status`; it only works on Franky's Mac from any directory, and nowhere else.
- The old screens poll the thread GET every 2 s (3 places) and each club-room GET now costs 9-13 PostgREST calls; nothing in wave 2's scope reduces desktop polling, so an open desktop event chat stays the most expensive reader on the site.
- `chat_repair_club`'s comment on production holds the APPLY RECORD of migration A (counts, SAE, the probe) — the only durable record of the apply besides `schema_migrations`; migration B must not `COMMENT ON` that function without carrying the text forward.
