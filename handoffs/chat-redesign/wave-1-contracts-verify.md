# Verification of `wave-1-contracts.md` (DRAFT 2), 2026-09-29

Read-only pass. No source file, migration or database row was changed. Production was not queried. Local database reads were SELECT / catalog only (`docker exec supabase_db_vibe psql`).

Inputs: draft 2, the critique of draft 1, draft 1, `wave-0-decisions.md`, `wave-1-asis.md`, the repo at `5cd325d`.

Three parts: (1) each critic finding against draft 2's text, (2) new problems draft 2 introduced, (3) the verdict.

Status: COMPLETE.

## Part 1 — Finding by finding

Section 13 of draft 2 was checked line by line against the text it points to. Every pointer lands on real text. Where the text differs from the critic's "Change:", it is marked DIFFERENT.

### HIGH

| # | result | note |
|---|---|---|
| H1 | DIFFERENT, fine | 6.6, 10.3, 3.6 and `chat_repair_club` (3.4) are all there, and the file is in B4's row. Difference: the critic wanted steps 3.2.7 AND 3.7 to call the function; draft 2 deleted 3.2.7 and calls it only in 3.7.1. That is the right reading: the function is created in 3.4, so 3.2 could not have called it. Two gaps in the function itself are in Part 2 (N6, N7). |
| H2 | TAKEN | Section 2 ("the two NEW reads"), section 7 ("NOT gated"), and the 3.10 table all agree. |
| H3 | TAKEN | 3.0 (count), 3.6 (`media_url` / `media_kind` null; both columns exist, checked in the catalog), 6.2 first row, 6.7, 10.3. The code `club_media_off` has two statuses (400 in 6.2, 403 in 6.7), as the critic wrote it; see N12. |
| H4 | TAKEN | Order B0 → B1a → B1b, B4, B5; rehearsal rule; B0 owns the type change, `room-rules.ts`, `message-read.ts`; section 10 lists `MessageBubble` and the list rows. The move of `message-read.ts` opens a new ownership problem (N2). |
| H5 | TAKEN | 3.10 table, the 503 `try_again` rule, rollback order, branch rule in gate 5. The old gate 6 (push per batch) is gone rather than moved; same effect. |

### MEDIUM

| # | result | note |
|---|---|---|
| M1 | TAKEN | 3.10 window table + the 15-minute target + the after-deploy check. The delete line says "a Board or a Lounge"; the critic also named event rooms (N8). |
| M2 | TAKEN | 3.4 `chat_channels_subscribe` fires on `UPDATE OF is_private`; section 8 removes the route's purge. Side effect on a database without the trigger in N9. |
| M3 | DIFFERENT, fine | Payload and `OFFICER_REMOVED_REASON` taken as written. The critic gave `RemovedContentCard` to B5; draft 2 puts it in the wave 2 row with the remove route. Fine: no officer removal can exist before that route ships. |
| M4 | TAKEN | 6.3 gate order and the "no `moderation_actions` row" text. The order has a dead branch that the critic's own text carried (N13). |
| M5 | TAKEN | 10.5 and 12.1. Verified: `campus-home.tsx:9860-9865` is the only caller of the RSVP route in `src/` and `public/html/`. A wording problem follows from it (N10). |
| M6 | TAKEN | 4.1 (option counts, `chat_votes_drop_access`, the known gap) and the exception sentence in section 3. |
| M7 | TAKEN | 6.1, both paragraphs, `gte` and the unchanged string included. |
| M8 | TAKEN | `EventRef & { going }`, `banner_url` in `OrgRef`, `author_role`, `voters_more`. |
| M9 | TAKEN | 6.4 label and `can_post`; B5 owns both share pickers; 10.4. One sentence in 6.4 is empty of meaning (N14). |
| M10 | TAKEN | 3.4 "No room cap, it never raises"; section 8 "No cap in v1"; 12.4. |
| M11 | TAKEN | Section 8 seed bullets. Draft 2 then adds the `sae_seed` constant, which the critic did not ask for (N1). |
| M12 | DIFFERENT, small problem | 3.4 and section 7 are taken. The critic also asked for 3.7. Draft 2's sentence sits under "All trigger functions", and `chat_repair_club` is not a trigger function, so its rows are not covered by the words (N6). |
| M13 | TAKEN | 3.9, positives first, own fixtures, the NOTICE names the failed condition. |
| M14 | TAKEN | 6.0; sections 5 and 7 reuse `OrgRef`, `EventRef`, `ViewerInRoom`. `Person` is typed twice (5 and 6.0), same fields. |
| M15 | TAKEN | 12.2, and `hidden` is reserved in 6.1. |

### LOW

| # | result | note |
|---|---|---|
| L1 | TAKEN | Section 3, "Statements appear in the file in the order 3.1 → 3.9". |
| L2 | TAKEN | All three checks are in 3.0. The SAE check collides with the seed (N1). |
| L3 | TAKEN | `channels_org_channel_has_org` in 3.3. |
| L4 | TAKEN | 3.9. How the first local run gets past its own check is not said (N11). |
| L5 | TAKEN | 3.4, in bold. |
| L6 | TAKEN | 12.7. |
| L7 | TAKEN | 6.1 `?root=`. |
| L8 | TAKEN | 3.4 "Accepted for v1, written down". |
| L9 | TAKEN | Section 1 and B0's row. |
| L10 | TAKEN | 4.2, 4.4, section 5. |
| L11 | TAKEN | 12.3, 12.4, 3.8, 12.10. |
| L12 | TAKEN | Section 7 "Also pinned", 6.4 "still `requests`", 10.5. |
| L13 | TAKEN | Section 7, both sentences. |
| L14 | TAKEN | Section 8 reorder, 10.6. |
| L15 | TAKEN | Section 2. |
| L16 | TAKEN | Gate 3. |

### Schedule

| # | result | note |
|---|---|---|
| Schedule | TAKEN | Section 0. All six rows of the critic's table moved out as asked. |

**Counts: 34 TAKEN, 3 DIFFERENT (H1, M3 fine; M12 a small problem), 0 DROPPED.** 37 findings in all.

## Part 2 — New problems in draft 2

Severity as in the critique. 1 HIGH, 5 MEDIUM (N2 to N5, N15), 16 LOW. Each has the words to change.

### HIGH

**N1. The `sae_seed` handle constant makes two versions of the production file, and the real local apply does the wrong thing to the seeded club.**
- Where: section 8 (last seed bullet), section 11 (rehearsal rule, last sentence). Sections 3.0 and 3.2.1 say `sae` as a literal, so the sections disagree.
- Checked: the local database has no club with handle `sae` (5 test clubs). The real local apply runs the production file, so step 3.2.1 is skipped and `sae_seed` goes through steps 2 to 5. Its private `general` is the first private channel by position, so step 4 makes it **Officers**. `exec` becomes a private `room`. 3.7 adds an empty Lounge. POST-CHECK passes. B1b, B4, B5 and the browser walk then run on that database.
- The same happens on production if the rehearsal copy is applied by mistake: SAE's `general` becomes Officers, not the Lounge (call c), and no check notices.
- The production file is never the file that ran to the end on SAE-shaped data. The "at most 1 member" pre-flight is never run in its passing state.
- "A constant at the top of the file" has no mechanism. A psql `\set` does not exist in a Management API apply.
- Change, section 8, replace the "Column absent" bullet and the last bullet with:
  - "Column absent (before migration A): today's behaviour plus two clubs. (1) **`sae`**, production's shape (asis 11.5): ONE member, its owner; private `general` with 3 messages by the owner; public `announcements`; public `events`; private `exec`. (2) **`chat_seed_club`**, the shape of every other club: public `general` with 3 messages and 1 reply, public `announcements` with one member-written message, 3 members besides the owner of which 1 admin and 1 mod, one member with a `going` RSVP and one with `maybe` to an upcoming event of that club, one event that ended 3 days ago, one that ended 10 days ago."
  - "Migration A has no handle constant. 3.0 and 3.2.1 say `sae`. The same file runs locally and on production."
- Change, section 11, rehearsal rule, replace the last sentence with: "The rehearsal copy is written to the scratchpad, never inside `supabase/migrations/`, and differs from the real file in one line only (the last `commit;` → `rollback;`). `diff` of the two must show that line and nothing else."
- Change, 3.9, add: "SAE, when it exists: its `lounge` is the row that was `general` and its `officers` is the row that was `exec` (both ids captured in PRE-FLIGHT)."
- A local club named `sae` is safe: no code or migration names that handle (grep: test files only).

### MEDIUM

**N2. `messages/route.ts` and `message-read.ts` each have two owners.**
- Where: 6.1 last bullet; section 11 rows B0 and B4.
- B0 "moves" the read out of `messages/route.ts` (`MESSAGE_SELECT` `:43`, `hydrateReactions` `:91`, `hydrateParentPreviews` `:128`, `prepareForClient` `:179`). That is an edit in B4's file.
- 6.1 says the move has "no behaviour change", and in the next sentence that `MESSAGE_SELECT` gains five columns. Nobody is named. If B0 adds them, the local thread GET reads columns that do not exist until B1a. If B4 adds them, B4 edits B0's file.
- `readChatMessage(client, id)` must return a whole `ChatMessage` for the wave-2 card routes, so `removed`, `reply_count`, `author_role`, `?after=`, `?root=` and the top-level filter belong in `message-read.ts`, not in the route.
- Change, section 11, B0 row: "`message-read.ts`: B0 creates it by moving the four pieces out of `messages/route.ts` unchanged, and makes the one edit in `messages/route.ts` that imports them. After B0 the file is B4's."
- Change, section 11, B4 row, add: "`src/lib/chat/message-read.ts` (after B0's move)".
- Change, 6.1 last bullet, last sentence: "B4 adds `kind, thread_root_id, card_event_id, removed_at, removed_reason` to `MESSAGE_SELECT`, the missing-schema retry, and `opts`."

**N3. B4 and B5 cannot run what they build until B1b has landed.**
- B4's send gate calls `canPost`, `loadRoom`, `filterRoomReaders` (B1b's `rooms.ts`) and reads `member.kind` (B1b's `ensureMember`). With B0's stub it compiles, but no Board send can be tried.
- B5 reads `viewer.can_post`, `room_kind`, `can_post` and the codes from B4's routes.
- So every behaviour check of B4 and B5 lands in the integration pass on day 3.
- Change, section 11, after the order line: "B1b's first commit, before anything else, is `rooms.ts` + `ensureMember` (section 8, first two bullets). B4 starts with 6.4, 6.6 and 6.7, which need nothing from B1b, and takes 6.1 and 6.2 once that commit is on the branch. B5 builds against `types.ts`; its screens are checked in gate 4."

**N4. Names that are used and never defined.**

| name | used in | add |
|---|---|---|
| the type `loadRoom` returns and `postRefusal` takes | 6.2, 8, 11 | 6.0: `type Room = { id: string; kind: RoomKind; name: string; org_id: string; event: { id: string; title: string; starts_at: string; ends_at: string } \| null };` |
| `postRefusal` | 6.2, 11 | 6.2: "`postRefusal(room: Room \| null, rootId: string \| null, role: ClubRole \| null)` returns the code for a send the database refused: `board_officers_only`, `board_post_missing`, `thread_root_not_allowed` or `room_closed`." |
| `opts` of `readChatMessages` | 6.1 | `{ before?: string; after?: string; root?: string; limit: number }` |
| `clubRoomLabel`, `canModerate` | 11 | `clubRoomLabel(clubName: string, kind: RoomKind, roomName: string): string` · `canModerate(role: ClubRole \| null): boolean` |
| `cards/validate` | 11, pure modules line | It is described nowhere. Delete it from that line, or add one sentence to section 5. |
| the after-deploy check | 3.10, gate 5 | No file, no owner. B1a's row: add `scripts/sql/chat-v2-after-deploy.sql`. |
| how the md5 is taken | 3.0 | "`md5(pg_get_functiondef(oid))`". Checked locally: that gives `269c1185…`. `md5(prosrc)` gives `89582328…` and the pre-flight would refuse. |

**N5. The JSON of a refusal is not pinned.**
- Today: thread and channel routes answer `{ ok: false, error: "<sentence>" }`; some add `code` (`contentBlockedResponse`, `fail()` at `api/orgs/route.ts:86`). Old screens print `j.error` (`_miniMessenger.js:851`).
- Draft 2 gives codes only. B4 and B5 run side by side: one may send the code in `error`, the other may read `code`. A code sent in `error` is printed raw by every screen B5 does not touch.
- Change, new last paragraph of 6.0: "Every refusal is `{ ok: false, error: <plain sentence>, code: <the code in this file> }`. Screens match on `code`, never on the status or the sentence. The sentences are constants in B0's `types.ts`: `board_officers_only` 'Only officers post here.' · `room_closed` 'This chat is closed.' · `club_media_off` 'Photos and videos are off in club chats for now.' · `board_post_missing` 'That post is no longer there.' · `thread_root_not_allowed` 'Replies only work under a Board post.' · `club_room` 'You can't leave a club's chat. Leave the club instead.' · `room_locked` 'This room can't be renamed, hidden or deleted.' · `try_again` 'Try again in a moment.'"

**N15. Five new triggers sit on the tables behind RSVP, events, joining and leaving, and nothing tests those writes.**
- Where: 3.4, 3.9, gate 2.
- The triggers are on `events`, `rsvps`, `org_members`, `channels`. A plpgsql body is not checked when it is created. An error at run time aborts the parent write: the RSVP, the new event, the cancel, the join, the leave, the new club, the account delete. For everyone, flag or no flag.
- "Never raise" in 3.4 covers only a missing parent row.
- POST-CHECK probes message inserts only. Gate 2 covers leave, re-join and removal.
- Not covered anywhere: an RSVP by a non-member (the local seed has one: `blake_iu` going to "Open Club Study Night"), an RSVP set to `no` through PostgREST, creating an event, cancelling an event that has RSVPs and a room with messages (the event DELETE runs on the cookie client, `events/[id]/route.ts:177`, and cascades into `rsvps` and `channels` at once), a role change up and down, deleting a club, deleting a user.
- Change, gate 2, add to the list: "an RSVP by a non-member succeeds and writes no row; `going` → `no` → `going` through PostgREST as the member; an event is created through `POST /api/events` and its room appears with the officers' rows; an event with 2 RSVPs and 3 room messages is cancelled through the route: event, room, rows and messages gone, no error; member → admin → member; a club is deleted; a user with RSVPs and messages is deleted."
- Change, 3.4, add (a call for the orchestrator, default yes): "The four AFTER trigger functions wrap their body in `begin … exception when others then raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm; end;`. A chat bug never blocks an RSVP, an event, a join or a leave. `chat_repair_club` repairs what a failed trigger missed. `chat_channels_fill_kind` (BEFORE INSERT) is not wrapped."
- What the wrap costs: a failed delete in `chat_rsvps_room` leaves a club member in an event chat after they changed their RSVP. Members only, so nobody outside the club gains anything.

### LOW

| # | where | problem | change |
|---|---|---|---|
| N6 | 3.4 | The `last_read_at = now()` sentence sits under "All trigger functions". `chat_repair_club` is not one, and it writes most of the rows on day one. | "Every subscription row the triggers AND `chat_repair_club` write is …" |
| N7 | 3.4, 3.7 | `chat_repair_club` "makes one club whole" but never creates a missing event room. 3.7 step 2 carries its own insert. In the window an officer can delete an event room from the old modal (the old DELETE has no guard, `channels/[channelId]/route.ts:160-177`) and nothing brings it back. | 3.4, new step between 1 and 2: "creates the missing event room of every event of the club with `ends_at + interval '7 days' > now()` (the row `chat_events_room` writes)". 3.7: delete step 2; step 1 says "and the event rooms (production: 3)". |
| N8 | 3.10 window table | "can still delete a Board or a Lounge". Officers and event rooms too. | "can still delete a Board, a Lounge, Officers or an event room" |
| N9 | 8, 3.10 | Section 8's routes read `kind`, and PATCH loses its purge. The missing-schema table has no row for them. Reachable: local before the apply, and a Vercel Preview of the branch before the apply. | 3.10 table, new row: "`…/channels` GET, POST, PATCH, DELETE, reorder → today's behaviour, the PATCH purge included; no `room_locked`". Section 8 PATCH bullet: "The purge is skipped only when `kind` can be read." |
| N10 | 0 item 5, 10.5 vs 6.4, 8 | The Going line ships in wave 1, but 6.4 and section 8 leave event rooms out of every old list. No screen shows an event chat until the flag is on (founders + SAE the week of Oct 5, everyone Oct 26). | Section 12, new point 15: "The Going line is shown three weeks before most people can open an event chat. Default: ship it with wave 1; the rows and the roster exist from the apply." |
| N11 | 3.9 | The policy constants are "copied after a local apply", but POST-CHECK needs them to pass. | 3.9: "The first rehearsal runs with the three constants empty: the check prints the three deparsed texts with RAISE NOTICE and raises `chat-rooms: policy constants are empty`. B1a pastes them in. No real apply runs with an empty constant." |
| N12 | 6.2, 6.7, 10.2, 6.1 | `club_media_off` is 400 in 6.2 and 403 in 6.7; 10.2 names the 400 only. `board_post_missing` is 409 on POST and 404 on GET. | 10.2: "B5 matches on `code` (6.0)", and add "403 `club_media_off` from the upload route". |
| N13 | 6.3 (wave 2) | The "already removed" answer cannot be reached. `messages_select_org_member` hides a removed message from everyone but its sender (read in `pg_policies`), so the cookie-client lookup finds nothing and the second tap answers 404. | 6.3: "No row on the cookie client, and `ensureMember` passed for the room: one service-role read of `id, removed_at` scoped to `[id]`. Removed and the caller passes the role check → `200 … already: true`. Else 404." |
| N14 | 6.4 | "For `scope` calls the co-member read is skipped for club rooms": `?scope=chats` has no club rooms. | Delete the sentence. |
| N16 | 3.10 | The after-deploy check lists clubs and rooms. The old leave route still deletes a member's row in the window (service role). | "…and every (member, public room) pair with no row." |
| N17 | 8 | After the apply an officer can create or rename a custom room to `board`, `lounge` or `officers`. The old lists then show two rooms with one name. | POST and PATCH bullets: "a name equal to `board`, `lounge` or `officers`, any case, on a `room` → 409 `room_locked`". |
| N18 | 3.10 rollback | The rollback drops `kind` and `event_id`. The event rooms and the Officers rooms that 3.7 and the triggers made stay, as private channels officers see in the old list. They are not in the manual steps. | Manual steps, add: "event rooms and created Officers rooms remain. With Franky's yes, BEFORE the columns are dropped: `delete from public.channels where kind = 'event';` (their messages go with them)." |
| N19 | 6, first line | "B0's and B1's helpers". There is no B1. | "B0's and B1b's helpers" |
| N20 | 4.2 (wave 2) | A card refused on a Board answers `cannot_post`; a message refused on the same Board answers `board_officers_only`. | "`P0C21` → 403 with `postRefusal()`'s code (`board_officers_only` or `room_closed`)". Delete `cannot_post`. |
| N21 | 6.4 | `can_post` on each list entry: not said how. One RPC per room is the obvious and slow reading. | "Computed in the route from `room_kind` and the viewer's club role (one `org_members` read for all the viewer's clubs): `board` → role in `BOARD_POSTER_ROLES`, else true." |
| N22 | gate 5 | The branch rule does not say if the branch is pushed. A pushed branch gets a Vercel Preview: new code on the production database before A is applied. Franky tests phones only through Vercel. | Gate 5: "The branch is pushed only after gate 4. Until A is applied its Preview is the missing-schema case of 3.10; nobody signs off wave 1 on the Preview. The first phone test on real data is after the merge." |

### Asked for by name

- **Something used in 3.2 that is only made in 3.4:** no. Draft 2 removed step 3.2.7; 3.2 now only updates rows. The critic's own H1 text had that impossible order; draft 2 fixed it.
- **`chat_repair_club` in 3.7 and in club creation:** the order works. In 3.7 the caller is `postgres`, so the refuse-inside line passes. In club creation the owner's row is inserted before the call (`api/orgs/route.ts:872`), so the new public rooms get the owner's rows from `chat_channels_subscribe`. Gaps: N6, N7.
- **The seed and the `sae_seed` constant:** not coherent, not safe for the production file. N1.
- **Files with two owners:** `messages/route.ts` and `message-read.ts` (N2). `channel-access.ts` and `rooms.ts` pass from B0 to B1b in order, and the contract says so.
- **Changed files with no owner:** the after-deploy check (N4). Nothing else.
- **Checked, no change needed:** `CampusMobile.tsx` (the phone's Campus › Chat uses B5's `ConversationView`); `MessagesMobile.tsx` already hides attach and Leave group on club rooms (`:1374`, `:2265`); desktop `ChannelChat` has no attach button; `threads/[id]/route.ts` refuses rename and photo on anything but a group; no code looks a room up by the name `general` or `announcements`; `channels.name` has no CHECK, so `left(title, 80)` fits; `events.ends_at` and `location` are NOT NULL; `channel_members.created_at` exists; `authenticated` has no INSERT on `channels` or `channel_members`.

## Part 3 — Is wave 1 buildable in three days?

**Yes, after N1 to N5 and N15 are written into the contract. About an hour of edits, no new decision from Franky except the N15 wrap and the N10 line.** Draft 2 took every finding (34 as written, 3 in another form, none dropped), the wave is the size the critic asked for, and the database design still holds against the live catalog: both md5s, the three policy texts, the columns and the grants in 3.0 and 3.6 match local today. What is left is mostly hand-over detail between batches, not design. The three days are still full: day 1 is B0 and then migration A with its seed, five triggers, the repair function, the probe and the rollback, by one batch on one database; days 2 and 3 are three batches side by side in four of the largest files in the repo, the integration pass, the walk, and a production apply at a quiet hour two days before f2.

**The single biggest remaining risk: migration A puts five triggers on the tables behind RSVP, events, joining and leaving, for every student, flag or no flag, and nothing in POST-CHECK or gate 2 exercises those writes (N15).** A mistake in one trigger body is not seen when the file applies. It is seen when the first student taps Going and gets an error. Add the gate 2 cases and decide the wrap before B1a starts.

Second, smaller: nobody can test wave 1 on a phone against real data before the merge (N22), and all of B4's and B5's behaviour is first seen together on day 3 (N3). If day 3 runs short, the production apply moves to after f2 rather than being squeezed.

## Summary

| | count |
|---|---|
| Critic findings TAKEN | 34 |
| DIFFERENT | 3 (H1 and M3 fine, M12 small, see N6) |
| DROPPED | 0 |
| New HIGH | 1 (N1) |
| New MEDIUM | 5 (N2, N3, N4, N5, N15) |
| New LOW | 16 (N6 to N14, N16 to N22) |
