# B1a notes (migration A + seed) — running log

Scratch folder: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1

- [start] Read contract 3.0-3.10, 8 (seed), 11 (rehearsal rule, gates 2 and 3); asis 1-7 and 11; the newest migration for house style.
- [seed] scripts/local-seed.mjs edited: detectRoomKinds() (42703 / PGRST204 = column absent), roomsFor/findRoom/ensureRoom (by name before, by kind after), CHAT_CLUBS (sae owner A; chat_seed_club owner A, E admin, C mod, B member), CHAT_MESSAGES, CHAT_EVENTS (upcoming +5d, ended 3d, ended 10d), CHAT_RSVPS (B going, C maybe), seedClubChat(). node --check passes. Not yet run.
- [seed] Ran twice against the local stack with channels.kind ABSENT. Run 1 added: 2 clubs (sae, chat_seed_club), 5 memberships, 6 rooms, 8 room rows, 8 messages (1 reply), 3 events, 2 RSVPs. Run 2: fingerprints of channels/messages/channel_members/rsvps/events identical (scratch: counts-after-seed-1.txt vs counts-after-seed-2.txt, seed-run-1.txt, seed-run-2.txt). Note: the seed re-dates its events on every run, as before.
- [migration] Started supabase/migrations/20261001100000_chat_v2_rooms.sql (header part 1 written). Local-rehearsal counts and COST in the header are placeholders until measured.
- [migration] Header (incl. ROLLBACK), begin, PRE-FLIGHT parts a-c written. PRE-FLIGHT policy constants were copied from local pg_policies by script (scratch: was_*.txt), not typed.
- [migration] PRE-FLIGHT d-h, step 1 (columns, indexes), step 2 (backfill 2.1-2.6 + re-read of the Officers promise), step 3 (9 CHECKs) written.
- [migration] Step 4.1-4.3 written (chat_channels_fill_kind, chat_channels_subscribe, chat_org_members_rooms).
- [migration] Step 4.4-4.6 written (chat_rsvps_room, chat_events_room, the 5 CREATE TRIGGERs, chat_repair_club + grant).
- [migration] Steps 5 (can_view_org_channel restated + can_post_org_channel), 6 (3 ALTER POLICY), 7 (repair for every club, guards 60 / 400) written. POST-CHECK next.
- [migration] POST-CHECK 9.1 a-d written (policy constants EMPTY on purpose for the first rehearsal).
- [migration] POST-CHECK 9.1 e-h and 9.2 (behaviour probe, private SQLSTATE P0C21), notify, commit written. Whole file drafted. Rehearsal copies are made by scratch/make-rehearsal.sh (last commit; -> rollback;, diff printed).
- [rehearsal 1] Constants empty: POST-CHECK printed the 3 deparsed texts and raised "chat-rooms: policy constants are empty" (scratch: rehearsal-1-empty-constants.out). Lesson: $w$$w$ inside a $$ block ends the block; empty constants are written ''. Texts extracted by script into want_org.txt / want_dm.txt / want_del.txt and pasted into the file.
- [rehearsal 2] PASSED: POST-CHECK green incl. behaviour probe (officer_board, member_reply, member_lounge accepted; 6 refusals 42501), then ROLLBACK (scratch: rehearsal-2.out). Step 7 locally: 15 rooms, 25 rows. channels.kind still absent afterwards.
- [check script] Design: scripts/sql/chat-v2-rooms-check.sql builds ALL its fixtures inside begin..rollback (7 throwaway auth users, 2 clubs, events), helpers live in pg_temp; ids travel between DO blocks as chat_check.* settings. Independent of the seed.
- [check script] Helpers + fixtures (0) + section A (new club) written.
- [check script] Section B (Board rule, plain-message rule, own-row delete) written; combined run so far green through B26 (scratch: combined-wip.out).
- [check script] B' (DMs), C (event room, RSVP going/no/going, non-member), C' (inside the room, officers keep rows, title rename, closed room) written; combined run green through C32. Lesson: an inline subquery in the same statement as a write does not see the write; reads after writes go through pg_temp.chat_get / chat_row.
- [check script] Complete: sections 0, A, B, B', C, C', C'', D, D', E. Combined run (migration body + check body + rollback) GREEN: "chat-check: all 148 cases passed", 0 WARNING lines (scratch: combined-wip.out; final copies are saved at the end). Database fingerprints identical before/after (counts-after-seed-2.txt vs counts-after-rehearsals.txt).
- [after-deploy] scripts/sql/chat-v2-after-deploy.sql written (one read-only SELECT: core_room, event_room, public_room_row, event_room_row, summary). Tested in a rolled-back transaction: 0 findings on the freshly migrated db; 6 findings after 4 deliberate breakages; 0 again after chat_repair_club (scratch: after-deploy-test.sql / .out).
- [cost, gate 3] Measured in rolled-back transactions (scratch: cost-gate3.sql/.out, cost-gate3-large.sql/.out, cost-baseline.sql/.out). Event room read: 5.0 ms (limit 200, 54 rooms, hashed subplan) / 31.6 ms (limit 200, 1054 rooms, per-message subplan, 0.16 ms per message vs 0.09 today). Inbox for a member of 5 clubs: list 4.2 ms, PEERS READ 86.9 ms for 620 co-member rows (per-row policy functions), last messages 8.8 ms. Numbers are in the migration header. Flag for B4: the peers read grows with members x rooms now that every member holds rows.
- [rollback section] The header's ROLLBACK statements were extracted by script and run after the migration body inside a rolled-back transaction: PASSED (function md5 back to 269c..., 3 policy texts equal the originals, no new column/function/trigger/index/constraint left; renames and rows stay, as the header says). Scratch: rollback-section-test.sql/.out.
- [check script] Added D30-D31 (joins as admin) and the broken-chat section, lettered E in the final file (chat broken on purpose: RSVP, event, join, role change still succeed; repair restores). Combined run: all 160 cases passed; the only WARNING lines are the 4 deliberate ones.
- [pre-flight] 25 refusal scenarios + the pass case, each in its own rolled-back transaction: all as expected (scratch: preflight-refusals.out). Variants of the database (no SAE, no club at all, no member below admin, nobody may publish, officer may not publish, SAE without general/exec): the rehearsal passes each, with the NOTICE that says what was skipped (scratch: rehearsal-variants.out).
- [check script] On a database WITHOUT migration A it stops at its first block with "chat-check: channels.kind is missing..." (verified on the current, un-migrated local db).

## FINAL STATE (B1a done, nothing committed, nothing applied)

Files (all four owned by B1a):
- supabase/migrations/20261001100000_chat_v2_rooms.sql (ends in commit; NEVER run by B1a)
- scripts/local-seed.mjs
- scripts/sql/chat-v2-rooms-check.sql (160 cases, begin .. rollback, local only)
- scripts/sql/chat-v2-after-deploy.sql (one read-only SELECT)

Proof, in the scratch folder:
- rehearsal_20261001100000_chat_v2_rooms.sql = the migration with its last line commit; -> rollback; (rehearsal-diff.txt shows that one line)
- rehearsal-final.out: clean rehearsal, POST-CHECK passed, ROLLBACK
- combined_migration_plus_check.sql + combined-final.out: migration body + check body + rollback: "all 160 cases passed"; the only WARNING lines are the 4 deliberate ones of section E
- preflight-refusals.out, rehearsal-variants.out, rollback-section-test.out, after-deploy-test.out, cost-*.out
- counts-after-seed-2.txt = counts-final.txt: the local database is exactly as the seed left it (channels.kind absent)

What the orchestrator still has to do:
1. Real local apply (psql < the migration), then scripts/sql/chat-v2-rooms-check.sql, then scripts/sql/chat-v2-after-deploy.sql (expect "0 findings").
2. Run node scripts/local-seed.mjs ONCE MORE after the apply: its "already migrated" path could not be run by B1a (PostgREST only sees committed schema). Expected: the line "Club chat: already migrated ...", rooms listed with their kind, totals unchanged (events are re-dated as always).
3. Production, before the apply: read the count of club-room messages with media_url set and write it in the header (LIVE STATE); the PRE-FLIGHT refuses anything but 0.

Choices made where the contract was silent (all reported in the final answer):
- PRE-FLIGHT is a little stricter than 3.0: names compared lower-case and trimmed; SAE's exec is included in the "nobody but officers lands in Officers" check; SAE has at most one exec, its announcements is public and its exec private.
- Someone who JOINS as owner/admin gets the open event rooms (3.4 only names "role becomes owner/admin").
- A role update that does not change officer status does nothing (the seed and join routes upsert).
- POST-CHECK probe: when no officer of the probe club passes can_publish_now(), only the officer's Board post is skipped (NOTICE), the rest runs.
