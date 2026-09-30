# B1a repair, round 1 (2026-09-29) — running log and dispositions

Scratch folder: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1 (repair outputs in its sub-folder `repair1/`)

Input: 33 findings of the four finished reviews (wave1-b1a-findings-run1.json) + 3 findings of the SQL lens. Nothing is committed and nothing is applied by this batch.

## Log

- [start] Read the 36 findings, contract 3.0-3.10 / 8 / 11 / 12, the whole migration (1,516 lines). The four files still carry the run-1 timestamps (07:34-08:10): no earlier repair touched them.
- [db] Local database read (read-only): channels.kind absent, 0 chat_ functions, org_members has its 4 triggers and the other four tables none, 0 club-room rows held by non-members, 0 club-room rows with accepted_at null. Fingerprint saved: repair1/fp-0-before-repair.txt.
- [seed] scripts/local-seed.mjs edited (findings 1, 2, 6, 7): the Mixer is 5 days back (not 7); chat_seed_club's three members hold no room rows before the migration (ensureBareMember; 6 rows of the earlier seed removed by the first run); the member-written Board message is skipped on a migrated database; on a migrated database every seeded club is passed to chat_repair_club; the script refuses to run after a rollback of A (kind absent, rooms named board/lounge/officers); header section THE CLOCK. node --check passes.
- [seed] Ran twice against the local stack (kind absent). Run 1: channel_members 12 -> 6, the Mixer re-dated; nothing else changed. Run 2: fingerprint identical to run 1 (repair1/fp-1-after-seed-1.txt = fp-2-after-seed-2.txt; seed-run-1.txt, seed-run-2.txt). The column-present path still cannot be run by this batch (PostgREST only sees committed schema).
- [migration] Body edited: chat_rsvps_room rewritten (OLD leaves, NEW arrives) and its trigger fires on any update; chat_repair_club steps 5 (rows that should not exist) and 6 (accepted_at); TimeZone UTC pinned on the three functions that compute the 7 days; PRE-FLIGHT: already-applied stop, grants, the exact trigger set, 0 rows held by non-members, SAE must have general and exec; step 7 guard (the repair may delete nothing at the apply); POST-CHECK: extra rows / accepted_at, media and SAE member count read again, proconfig arrays, two function fingerprints, tgtype of chat_rsvps_room; 9.3 the apply record (written at the end of chat_repair_club's comment).
- [rehearsal 1] Fingerprint constants empty on purpose: printed both md5 and raised "function fingerprints are empty" (repair1/rehearsal-1-empty-fingerprints.out). Pasted by script (repair1/paste-fingerprints.py), never typed.
- [rehearsal 2] PASSED, then ROLLBACK (repair1/rehearsal-2.out): step 7 created 15 rooms and 31 rows. Database fingerprint unchanged afterwards.
- [migration] Header rewritten in pieces: WHAT IT DOES 4/7/9, DOES NOT (table grants, blocks, settings columns, the allow-list), LIVE STATE (the orchestrator's production facts of 2026-09-29, the two new fingerprints, the local rehearsal as it really is), new PRE-CHECK (4 read-only queries), APPLY ORDER (the 7 window rows), CHECK AFTER APPLYING (apply record, rooms by kind, the after-deploy script), ROLLBACK (the one safe place of the manual steps, as commented SQL), COST outputs copied to wave-1-build/B1a-cost/.

## Log, second sitting (the first one stopped after the header rewrite; nothing was lost)

- [resume 15:10] Picked up the tree as the first sitting left it: seed and migration edited and rehearsed (repair1/), the check script half edited (last write 14:30), the after-deploy script untouched (08:00). Local database read: kind absent, 0 chat_ functions, only the 4 org_members triggers, no open transaction. Fingerprint = repair1/fp-2-after-seed-2.txt (repair2/fp-0-start.txt). Outputs of this sitting: scratch `repair2/`.
- [state 16:10] Rehearsal of the migration as the first sitting left it: PASSED, ROLLBACK (repair2/rehearsal-a.out; 15 rooms, 31 rows). Combined run with the check script as left: 187 cases passed, no real WARNING (repair2/combined-a.out). Sections M (moved RSVP, 14 cases), T (time zone, 6) and X (repair removes rows, 7) were already in; section E was still the run-1 version and the header already said 203. Still to do: section E (SQL lens 3), the after-deploy script, final runs, dispositions.
- [check script 16:30] Section E rewritten (SQL lens 3): break trigger 1 is BEFORE INSERT OR DELETE on channel_members, break trigger 2 BEFORE INSERT OR UPDATE on channels (created after E13); new cases E3-E8 (RSVP going -> no, admin -> member, room -> private: each write succeeds, its row stays), E14-E17 (event INSERT without a room, title UPDATE with the old room name), E19-E21 (what the repair removes, what it does not mend, the by-hand fixes). 23 cases in E (was 10). Combined run: all 200 cases passed; 9 WARNING lines, all "deliberate failure" (repair2/combined-b.out). Header: expected count 200.
- [after-deploy 16:45] scripts/sql/chat-v2-after-deploy.sql rewritten: four new lists (extra_row, pending_row, core_room_name, event_room_name), the fix column is a CASE (the repair, or the by-hand rename), the 7 days are counted in UTC whatever the session zone, header says weekly run and what is not listed. Tested in a rolled-back transaction after the migration body (repair2/after-deploy-test.sql / .out): 0 findings fresh, 9 findings after 9 deliberate breakages, 0 after the repair + the two renames, 0 again in a Pacific/Auckland session.
- [proofs 16:55] In repair2/: preflight-refusals.out (the pass case + 11 refusals, among them the 7 stops added by this repair: already applied, grants, a foreign trigger on channel_members / rsvps, org_members with 3 triggers, a row held by a non-member, SAE without general / without exec); rehearsal-variants.out (v1: a private and an extra public channel make backfill steps 2.4 and 2.5 change 1 row each; v2: no SAE; v3 / v4 / v5: someone joins SAE, a photo is sent, a non-member row appears AFTER the PRE-FLIGHT, each stopped by the POST-CHECK or the step 7 guard; v6: nobody below admin may publish, the file passes and the APPLY RECORD says SKIPPED); rollback-section-test.out (the header's ROLLBACK as written: 9 x t); rollback-manual-steps-test.out (with every manual step run, channels, channel_members and messages read exactly as before the migration).
- [header] One header change from that last test: the manual step deleted only the Officers rooms step 7 made; a club that had no channel at all also gets a Lounge and a Board from step 7 (local: test_bloomington_cycling). The DELETE now names the three core kinds.
- [final 17:05] Final rehearsal PASSED then ROLLBACK (repair2/rehearsal-final.out; the copy differs from the real file in the one line commit; -> rollback;, repair2/rehearsal-diff.txt). Final combined run: all 200 cases passed, 9 WARNING lines, all deliberate (repair2/combined-final.out). Seed run twice on the un-migrated database: both runs change nothing (repair2/fp-0-start.txt = fp-1 = fp-2). The policy texts did not change in this repair, so the empty-constants run was not repeated; the two function fingerprints were bootstrapped by the first sitting (repair1/rehearsal-1-empty-fingerprints.out) and still match. Local database at the end: kind absent, 0 chat_ functions, only the 4 org_members triggers, fingerprint identical to the start (repair2/fp-3-final.txt).

## Dispositions (36 findings: 33 of the four reviews + 3 of the SQL lens)

### Seed lens
1. The seed can move an event into its 7-day window after the apply — FIXED. The Mixer is 5 days back; on a migrated database the seed ends with chat_repair_club for every seeded club; the seed header (THE CLOCK) says to run it the same UTC day as the rehearsal and the apply.
2. chat_seed_club's members already hold their room rows — FIXED. Before the migration its three members hold no rows (ensureBareMember; the 6 old rows were removed by the first run); step 7 now writes 31 rows locally and the header says so.
3. The header credits the seed with rows the seed did not write — FIXED. LIVE STATE names the leftovers of manual tests and says the probe ran as avery_owner.
4. No RSVP sits on an ended event — REJECTED for the seed (contract 8 fixes its list; the orchestrator's decisions do not add to it). Covered by the check script instead: T1-T5 (an event that ended 167 h 30 min ago with a Going RSVP, room remade by the repair) and C28 / X6 (past the window).
5. Backfill steps 2.4 and 2.5 match 0 rows locally — FIXED as asked: a rollback-only variant ran them (repair2/rehearsal-variants.out, v1: board-room became Officers and no second Officers room was made; rides became a room with 4 rows). No seed change.
6. After a rollback of migration A the seed doubles every club's rooms — FIXED. The seed refuses to run when kind is absent and rooms are named board / lounge / officers.
7. On a database migrated before it was seeded, the seed writes a member's top-level Board post — FIXED. That message is marked `before` and skipped when kind is there.
8. The column-present path has never run — OUT OF REACH of this batch (PostgREST only sees a committed schema). The compare query is in "Still for the orchestrator" below.
9. Optional: no closed event chat on the migrated local database — REJECTED. Not in contract 8, and it would be new code in the one path this batch cannot run. The check script has the closed room (C27-C32).

### Rollout lens
10. What the file says by NOTICE never reaches the person applying — FIXED. Header PRE-CHECK (4 read-only queries with expected answers); what must stop the apply is an exception; step 7's counts, SAE and the probe's result (passed / SKIPPED and why) are written into the comment of chat_repair_club, which CHECK AFTER APPLYING query 1 returns.
11. SAE post-check weaker than contract 3.9 — FIXED. PRE-FLIGHT e and POST-CHECK c raise when SAE has no general or no exec (preflight-refusals.out).
12. Three gate-2 cases are SQL stand-ins for a route — FIXED in the check script header (STILL TO RUN OVER HTTP) and listed below for the orchestrator. B1a-notes.md is the builder's log and was left as it is.
13. APPLY ORDER lists 3 of the 7 window rows — FIXED. All seven are in the header.
14. ROLLBACK gives no SQL for the manual steps — FIXED. Commented SQL at the one safe place, the Board-replies sentence, and (this sitting) the DELETE names the three core kinds. Proven: with every manual step run the three tables read exactly as before the migration (rollback-manual-steps-test.out).
15. PRE-FLIGHT facts are not read again — FIXED. POST-CHECK b re-counts media, POST-CHECK c re-counts SAE's members (variants v3, v4).
16. DOES NOT is not quite true about grants, silent on blocks — FIXED. "any table grant", the EXECUTE grants named, one paragraph on blocks (contract 12.2 needs nothing from this file).
17. Header numbers stale or unreachable on the apply day — FIXED. "as of 2026-09-29 ... re-read on the apply day (PRE-CHECK 3)"; the production facts the orchestrator read on 2026-09-29 are in LIVE STATE with the sentence that they are read again right before the apply; cost outputs copied to wave-1-build/B1a-cost/.
18. A second run says "can_view_org_channel drifted" — FIXED. The first check of the PRE-FLIGHT answers "already applied".
19. The two function bodies are never fingerprinted — FIXED. POST-CHECK e compares md5(pg_get_functiondef) of both; the values are in LIVE STATE ("After this file").
20. The check script is local-only by comment alone, no expected count — FIXED. `\set ON_ERROR_STOP on` before begin; "Expected last line: all 200 cases passed".
21. POST-CHECK g tests grants only at the end — FIXED. The same five tests run in the PRE-FLIGHT before any lock; g stays. PRE-CHECK 4 reads them on production.
22. The after-deploy check cannot see a renamed core room — FIXED. List core_room_name, fix printed as a by-hand update.

### Triggers lens
23. A moved RSVP leaves the old event-room row behind (medium) — FIXED, same fix as 28.
24. Nothing lists or repairs a row that should not be there — FIXED by the orchestrator's decision: chat_repair_club steps 5 and 6, after-deploy lists extra_row and pending_row. Rows left on a room turned private are neither removed nor listed: they open nothing (check case E20), and the after-deploy header says so.
25. Two writes at the same moment can each miss the other's row — FIXED as asked (wording): comment above 4.6 and the weekly run in the after-deploy header.
26. The PRE-FLIGHT does not check the trigger set — FIXED. Exact set checked, channel_members included; LIVE STATE line corrected.
27. chat_channels_fill_kind turns a private general into the public Lounge — REJECTED. Contract 3.4 says "lounge / name lounge / public"; the file follows it and the comment of 4.1 now says what that means. Whether the backfill's reading was meant is the contract owner's call.

### Security lens
28. HIGH: an RSVP can be moved to another event without firing chat_rsvps_room — FIXED. The trigger fires AFTER INSERT OR UPDATE OR DELETE (any update); the function treats an update as "OLD leaves, NEW arrives"; POST-CHECK f checks tgtype 29 and no column list; check cases M1-M14 (moved with and without status, moved with no, an officer, a non-member, user_id changed).
29. The after-deploy check never lists a row that should not exist — FIXED, same as 24.
30. A demoted officer who holds an allow-list row keeps Officers — REJECTED as a change (decision 27 keeps the allow-list; changing it is Franky's call). Written in DOES NOT.
31. accepted_at can still be set to null on a club-room row — FIXED in the database by the orchestrator's decision (repair step 6, check case X5, after-deploy pending_row). The route half is a request to B4, see contract problems.
32. Nothing in the check script refuses another database — FIXED. It raises unless inet_server_addr() is null (the unix socket).
33. For the record: what untouched SELECT policies expose, blocks against a direct read — NO CHANGE in B1a, as the finding says. One sentence in DOES NOT about the settings columns; the direct-read question is for the contract of the wave that builds 12.2.

### SQL lens
S1. The 7-day window is computed in the session time zone — FIXED. `set timezone to 'UTC'` on chat_org_members_rooms, chat_repair_club and can_post_org_channel (interval '7 days' kept); POST-CHECK e compares the whole proconfig array; check section T (6 cases in a zone whose clocks went forward); the after-deploy script counts the 7 days in UTC whatever the session zone.
S2. An event room's name can drift from the event's title — FIXED. After-deploy list event_room_name with the by-hand update as its fix; no change to the migration. Check cases E17, E20, E21.
S3. Section E breaks INSERTs only — FIXED. Two break triggers (INSERT or DELETE on channel_members; INSERT or UPDATE on channels), 13 new cases, 23 in E; the count in the last NOTICE is 200.

## Where the file now differs from the contract's wording (by the orchestrator's decisions; the contract text is unchanged)

- 3.4, row chat_rsvps_room: the contract says "AFTER INSERT OR UPDATE OF status OR DELETE"; the file fires on any UPDATE.
- 3.4, chat_repair_club: the contract lists 4 steps that only insert; the file has steps 5 (deletes rows that should not exist) and 6 (sets accepted_at). 3.10 says of the after-deploy check "lists clubs without ..., events ... without a room, and every (member, public room) pair with no row"; the script lists five more things.
- 3.7.2 "Nothing is deleted" still holds at the apply: step 7 counts what the repair would delete first and stops on any.
- 3.5: can_post_org_channel, chat_repair_club and chat_org_members_rooms carry `set timezone to 'UTC'` next to `set search_path to ''`.

## Requests to other batches

- B4 (finding 31): in /api/me/threads a row whose channel has org_id set is never a request, whatever accepted_at says; the decline route answers 400 `club_room` for a club room, like the leave guard.
- Contract of the wave that builds 12.2 (finding 33): say whether blocks must hold against a direct PostgREST read of messages.

## Still for the orchestrator

1. Real local apply, then scripts/sql/chat-v2-rooms-check.sql on its own (expect "all 200 cases passed", 9 deliberate warnings), then scripts/sql/chat-v2-after-deploy.sql (expect 0 findings).
2. The seed on the migrated database, the same UTC day. Before and after it, the same line twice: `select (select count(*) from public.channels) ch, (select count(*) from public.channel_members) cm, (select count(*) from public.messages) msg, (select count(*) from public.rsvps) rsvp, (select count(*) from public.events) ev, (select count(*) from public.org_members) om, (select md5(string_agg(id::text || kind || name || is_private::text, ',' order by id)) from public.channels where org_id is not null) rooms_md5, (select md5(string_agg(channel_id::text || user_id::text, ',' order by channel_id, user_id)) from public.channel_members) rows_md5;`
3. Over HTTP on the dev server: POST /api/events as an officer; PUT /api/events/[id]/rsvp as a member and as a non-member; DELETE /api/events/[id] on an event with 2 RSVPs and 3 room messages; then the after-deploy check.
4. Production, right before the apply: the four PRE-CHECK queries of the migration header.

- [last 17:20] After the last edit to the migration (the repair's two statements now name `c.type = 'org_channel'`; the after-deploy lists extra_row and pending_row do the same) every proof was built again from the final files and rerun: rehearsal-final.out, combined-final.out (200), after-deploy-test.out (0 / 9 / 0 / 0), rehearsal-variants.out, rollback-section-test.out, rollback-manual-steps-test.out. Builders kept in repair2/ (make-rehearsal.sh, make-combined.sh, build-variants.py, build-rollback-tests.py). The local database reads as at the start: fp-3-final.txt = fp-0-start.txt, kind absent, 0 chat_ functions.
