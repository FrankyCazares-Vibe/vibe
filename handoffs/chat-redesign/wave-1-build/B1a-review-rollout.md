# B1a review — lens: HOUSE STYLE AND ROLLOUT (read-only reviewer)

Running log, then findings. Nothing in the repo is changed by this review except this file.

- [start] Read contract 3.0-3.10, 11 (gates), 12; the house-style reference 20260930100000_event_cancel_notices.sql; B1a-notes.md.
- [read] Migration read end to end (1516 lines). Candidates so far: APPLY ORDER text lists 3 of the 7 window rows of 3.10; ROLLBACK names the manual steps but gives no SQL and they become impossible after DROP COLUMN kind; NOTICEs (probe skipped, step 7 counts) are invisible through the Management API. To verify against the catalog next.
- [read] Both scripts read end to end. chat-v2-rooms-check.sql: every gate-2 case has a numbered case; three of them (event create, event cancel, RSVP) are SQL stand-ins for a route, to be compared with the route code. chat-v2-after-deploy.sql: one SELECT, the three lists of 3.10 plus event_room_row.
- [catalog] Local db is still un-migrated (channels.kind absent). md5 of can_view_org_channel and org_members_drop_club_access match the header. channels/rsvps/events have no trigger, org_members has 4: header LIVE STATE is true. postgres locally: not superuser, bypassrls true.
- [recipe] The Management API curl recipe (20260926100000:74-85) returns JSON only: RAISE NOTICE never reaches the person applying.
- [resume] Session resumed; re-reading contract 3.0-3.10 + 11 and the migration. Local db re-checked: channels.kind absent, both md5 match, no schema_migrations row, no ACCESS EXCLUSIVE lock held.
- [verified] Header LIVE STATE is true locally (triggers: channels 0, rsvps 0, events 0, org_members 4; messages 2 permissive INSERT, no UPDATE policy; authenticated INSERT yes / UPDATE no; channel_members 1 DELETE policy; 7 clubs, 14 club channels, 11 memberships, 7 events in window, 0 club media). was_* constants == live pg_policies; want_* == scratch want_*.txt. Rehearsal copy differs from the real file in the last line only. Standing-rule query == asis 4.6.
- [verified] PRE-FLIGHT has every 3.0 bullet (a functions by md5(pg_get_functiondef); b 3 policy texts + no other permissive INSERT/DELETE; c names free: 5 columns, 12 constraints, 6 indexes, 7 functions, 5 triggers; d shape; e SAE <= 1 + ids captured; f Officers pick; g media; h row guards 60/40). No read of schema_migrations outside comments.
- [verified] Check script: all 18 gate-2 cases have a numbered case (B8, B3, B10, B11, C30-31, B24-26, C6/C21, D2-3, D6-7, D8-9, D13-14, C4-5, C8-13, C1-3, C41-47, C33-40, F10-11, F5-8). Three are SQL stand-ins; statements match the route code (events/route.ts:508, events/[id]/route.ts:176, rsvp/route.ts:168).
- [verified] After-deploy script: one SELECT, lists the three things of 3.10 + event_room_row; on the un-migrated local db it fails with 42703 as its header says.

## Findings (written as found)

### F1 (medium) NOTICEs never reach the person applying on production
File: supabase/migrations/20261001100000_chat_v2_rooms.sql lines 1161, 1236, 1245, 1414, 1439, 1510 (RAISE NOTICE), header 88-95.
Evidence: the apply recipe (20260926100000_users_profile_layout.sql:74-85) is a curl to the Management API /database/query, which answers JSON rows or an error; RAISE NOTICE is not in the answer. Five things the file only says by NOTICE: step 7 counts; "SAE had no general / no exec" (the SAE POST-CHECK did not run); "behaviour check skipped"; "officer's Board post is not probed"; "behaviour check passed". scratch rehearsal-variants.out shows the file COMMITs in all of those cases. Production has 2 members below admin in total (asis 11.5: test-6ca4ec6e and test-f7ae4129, hidden test clubs); if neither passes can_publish_now() the whole probe of 3.9 is skipped and nobody sees it.
Change: add a header section "PRE-CHECK (read-only, production, the apply day)" with the queries whose answer decides each NOTICE, and the expected answers; and give CHECK AFTER APPLYING the by-kind count with the expected production numbers. Text in the final answer.
Proposed PRE-CHECK queries for F1 (all three ran read-only on the local db: sae 1/1/1; 3 members + 8 officers may publish; 7 events in window):
  select o.handle, (select count(*) from public.org_members m where m.org_id = o.id) members,
         (select count(*) from public.channels c where c.org_id = o.id and c.type = 'org_channel' and c.name = 'general') general_rows,
         (select count(*) from public.channels c where c.org_id = o.id and c.type = 'org_channel' and c.name = 'exec') exec_rows
    from public.orgs o where o.handle = 'sae';                                   -- production: 1 / 1 / 1
  select count(*) filter (where m.role in ('member','mod')) members_who_may_publish,
         count(*) filter (where m.role in ('owner','admin')) officers_who_may_publish
    from public.org_members m join public.users u on u.id = m.user_id
   where u.terms_accepted_at is not null and u.age_attested_at is not null and u.school_verified
     and not exists (select 1 from public.account_restrictions r where r.user_id = u.id and r.lifted_at is null
                      and r.starts_at <= now() and (r.ends_at is null or r.ends_at > now()));
                                                                                 -- members 0 = the behaviour probe is SKIPPED
  select count(*) from public.events where org_id is not null and ends_at + interval '7 days' > now();  -- = event rooms step 7 makes
CHECK AFTER APPLYING addition: select kind, count(*) from public.channels where org_id is not null group by kind order by kind;
  -- production, from the Sept 29 dry run: board 5, lounge 5, officers 5, room 1, event = the third PRE-CHECK number

### F2 (medium) POST-CHECK c is weaker than contract 3.9 for SAE: a missing general / exec is a NOTICE, not a stop
File: migration lines 400-425 (PRE-FLIGHT e captures '' when SAE has no channel named general / exec) and 1234-1251 (POST-CHECK c: v_was null -> raise notice, no check).
Evidence: scratch rehearsal-variants.out lines 17-20: "SAE had no general; its Lounge is a new room" / "SAE had no exec" and the file goes on to COMMIT. If SAE's private general is renamed in the old desktop modal before the apply, 2.1 skips it, 2.5 makes it a private room, step 7 makes a NEW empty Lounge, and the 3 messages never reach the Lounge. 3.9 asks that the Lounge IS the row that was general. Not in B1a's list of choices.
Change: in PRE-FLIGHT e, after the exec count: if SAE exists and has no org_channel named general, or none named exec -> raise exception 'chat-rooms: SAE has no channel named general (or exec); step 2.1 was written for both. Re-read it first'. Then POST-CHECK c needs no NOTICE arm. The seed builds SAE with both, so local still passes.

### F3 (medium) Gate 2's three route cases are SQL stand-ins and nobody is down to run them over HTTP
File: scripts/sql/chat-v2-rooms-check.sql lines 19-29 (says so), cases C1-C3, C41-C47, C4-C16; B1a-notes.md "What the orchestrator still has to do" (3 items, none of them this).
Evidence: contract 11 gate 2: "an event is created through POST /api/events", "cancelled through the route", "through PostgREST as the member". The statements do match the routes (events/route.ts:508-519 service-role insert, events/[id]/route.ts:176-180 cookie-client delete + select id, rsvp/route.ts:168-173 upsert). Gate 4's walk does not create or cancel an event either.
Change: add item 4 to the orchestrator's list and to the script header: after the real local apply, with the dev server the orchestrator runs: POST /api/events as an officer -> room + officers' rows; PUT /api/events/[id]/rsvp as a member and as a non-member; DELETE /api/events/[id] on an event with 2 RSVPs and 3 room messages -> 200, nothing left; then scripts/sql/chat-v2-after-deploy.sql says 0 findings.

### F4 (low) APPLY ORDER lists 3 of the 7 window rows of contract 3.10
File: migration header lines 75-81. Missing: the old inbox lists event rooms with the people who RSVP'd; the old desktop modal can still delete a Board / Lounge / Officers / event room; leaving a club room from the old inbox still deletes the row; flipping a Board to private is refused by the CHECK (500); "the old route answers its bare 500". The after-deploy header has two of them, the migration header is what the person applying reads.
Change: replace lines 77-80 with the seven rows (wording in the final answer).

### F5 (low) ROLLBACK names the manual steps but gives no SQL, no place in the order, and leaves one consequence out
File: migration header lines 97-107 and 166-182.
Evidence (scratch temp table, rolled back): "SAE's general private again" run before DROP CONSTRAINT -> ERROR violates check constraint (the open_rooms_public CHECK); after DROP CONSTRAINT -> UPDATE 1; after DROP COLUMN kind an event room can only be told by position 1000. Not listed at all: DROP COLUMN thread_root_id turns every Board reply written since the apply into an ordinary top-level message of the Board. Rollback test of B1a (rollback-section-test.out) = the header's statements, byte for byte apart from BEGIN / COMMIT: the automatic part is proven.
Change: the manual steps as commented SQL between the DROP CONSTRAINTs and the DROP COLUMNs, plus one sentence on the replies (text in the final answer).

### F6 (low) PRE-FLIGHT facts are read before any lock is held and never re-read
File: migration lines 400-407 (SAE count), 459-465 (media), POST-CHECK c 1232-1252.
Evidence: read committed, no LOCK TABLE; org_members is first locked by CREATE TRIGGER (line 909), messages by ALTER TABLE (485). A join to SAE or a photo sent in between passes. POST-CHECK does not count SAE's members or media again.
Change: re-read both in POST-CHECK (by then both tables are locked against writes), same messages as the PRE-FLIGHT.

### F7 (low) DOES NOT is not quite true, and is silent on Franky's answer 2 (blocks)
File: migration header lines 40-44.
Evidence: "any grant" but lines 996, 1033, 1081 are GRANT EXECUTE. And: SELECT policies untouched + step 7 puts every member on every public room, so two people who blocked each other still read each other in club rooms and now meet in each other's inbox previews (threads/route.ts block filter is 1:1 only, asis 8.8). Contract 12.2 builds the hiding with the screens; the header should say it is NOT in this file.
Change: wording in the final answer.

### F8 (low) Header numbers that will be stale or unreachable on the apply day
File: migration header lines 56-68, 219-220.
Evidence: "3 event rooms" is Sept 29 (asis 11.6: 0 upcoming, 3 inside the window: all three leave it by Oct 6 at the latest); media count "NOT READ"; "Outputs: the rehearsal scratch folder" is /private/tmp/claude-501/... (a session temp folder). Seed reviewer F3 covers "seeded with ... 7 clubs".
Change: say "as of Sept 29; re-read on the apply day (PRE-CHECK)", fill the media count before the apply, copy the three cost outputs to handoffs/chat-redesign/wave-1-build/ and name that path.

### F9 (low) A second run on an applied database says "can_view_org_channel drifted"
File: migration lines 255-262 (the md5 check runs before the names-are-free checks at 314-323).
Evidence: preflight-refusals.out: a changed function answers "drifted (md5 ...); re-read it first". The API answers [] on success, so a nervous second run is likely.
Change: first check of the PRE-FLIGHT: if channels.kind exists -> raise exception 'chat-rooms: already applied (channels.kind exists); nothing to do'.

### F10 (low) The two function bodies are never fingerprinted after the change
File: migration POST-CHECK e, lines 1294-1315 (attributes only); header LIVE STATE has the OLD md5 only.
Change: after the local apply copy md5(pg_get_functiondef) of can_view_org_channel(uuid,uuid) and can_post_org_channel(uuid,uuid,uuid) from the catalog into POST-CHECK e and into the header (migration B's PRE-FLIGHT needs them), the way the policy constants were copied.

### F11 (low) chat-v2-rooms-check.sql: "LOCAL ONLY" is a comment; the expected count is not in the file
File: scripts/sql/chat-v2-rooms-check.sql lines 5-7, 41-51, 1101.
Change: first line after the header `\set ON_ERROR_STOP on` (a psql meta-command: the Management API and the MCP refuse the file at character 1, and a run without -v still stops at the first failure); header: "expected last line: all 160 cases passed".

### F12 (low) POST-CHECK g checks grants the file never changes, after the locks
File: migration lines 1343-1351. Production ACLs of channels / channel_members are not in asis 11.3 (messages only).
Change: copy the same five has_table_privilege tests into the PRE-FLIGHT (refuse before ALTER TABLE), keep g.

### F13 (low) after-deploy cannot see two things old code can do in the window
File: scripts/sql/chat-v2-after-deploy.sql lines 23-31. It has the three lists of 3.10 (+ event_room_row), one SELECT, read-only: verified. Not listed: a core room renamed by the old PATCH (asis 8.4: renames ANY channel) so name <> kind; rows that should not be there (security / triggers reviewers).
Change: a fifth list core_room_name (kind in board, lounge, officers and name is distinct from kind); the fix is a write and needs Franky's yes.

- [note for the orchestrator, outside B1a] The relayed request says of blocks: "you shouldnt be able to see their messages still". Contract 12.2 keeps one exception (an officer's top-level Board post shows to every member, blockers included). Worth one line to Franky before the screens wave; nothing in B1a builds or prevents either.
- [done] Review finished. Nothing but this file was written; no migration, rehearsal or check script was run; the only writes were temp / scratch objects inside begin .. rollback.
