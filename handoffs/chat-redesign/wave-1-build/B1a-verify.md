# B1a independent verify (run 2) — running log

Scratch: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1/verify/
Rule: no repo file changed; only local DB; every run rolls back.

## Step 0 — setup (2026-09-29)
- verify/ folder created, empty at start.
- git status: M scripts/local-seed.mjs, ?? the 3 new B1a files. Nothing else.
- Files: migration 1964 lines, check 1493 lines, after-deploy 203 lines, seed 929 lines.
- Local stack up (supabase_db_vibe healthy).
- Read contract 3.0-3.10, 8, 11, 12; builder log B1a-notes.md; repair log B1a-repair.md.
- NOTE: the task text says "160 cases" and "about 1,500 lines"; the files on disk are the REPAIRED ones (migration 1964 lines, check script header expects 200 cases per B1a-repair.md). I verify what is on disk.

## Baseline (before any of my runs) 16:24 EDT
- md5: migration e4aab3e269bd0a46fd9299f19df861b8, seed 21e57c9e3e4ca8fd035fbc78e33580fe, check 813b7868cc212d4878d3eb5a21489d83, after-deploy e2a8395fdec972e5d03b50a7f7cdde2e
- DB: 0 new columns (kind/event_id/thread_root_id/card_event_id), 0 chat_ functions, triggers only the 4 org_members + 2 messages ones.
- counts: channels 15, channel_members 6, messages 10, rsvps 3, events 8, org_members 11, orgs 7, users 7, auth.users 7
- md5: channels 8d3bf34ace03f422fd9b05f03ad87318, cm adb459ef49b790a3f5b2280c1f1735c3, msg 87baa492f084d50077356366b5390124, rsvps 33e36274b227ae638cdc4af5e4e99073, om d0974f3b143bb4dbb5cd36242ce135a6
- no open transaction from anyone else.

## Step 1 — own rehearsal: CLEAN
- Copy: verify/rehearsal_20261001100000_chat_v2_rooms.sql, built with awk from the real file (line 1964 only).
- diff real vs copy (verify/rehearsal-diff.txt): `1964c1964 / < commit; / > rollback;` and nothing else.
- The file has exactly one non-comment commit/rollback statement (line 1964); no psql meta commands, no dblink.
- Run: psql exit 0, 63 output lines (verify/rehearsal-1.out). Ends `NOTIFY` / `ROLLBACK`.
- Key lines:
  - backfill UPDATEs: 1,1,1,1 (SAE by hand), 5, 5, 0, 0, 13 (renames)
  - `NOTICE: chat-rooms: step 7 created 15 rooms and 31 rows, deleted 0 rows, set accepted_at on 0 rows`
  - `NOTICE: chat-rooms: behaviour check passed: officer_board=accepted;member_reply=accepted;member_lounge=accepted;member_board=42501;poll=42501;forged_removal=42501;media=42501;missing_root=42501;root_in_lounge=42501;`
  - `NOTICE: chat-rooms: APPLY RECORD 2026-09-29 20:25 UTC: ... SAE is there: its Lounge is the row that was general, its Officers the row that was exec; ...`
  - no WARNING, no ERROR.
- Catalog read afterwards: channels.kind absent (information_schema 0 rows, pg_attribute 0), 0 chat_ functions, can_view_org_channel md5 = 269c1185295552f74930f1acffd7c170 (the old body), same 6 triggers, counts and md5 of channels / channel_members identical to baseline.

## Step 2 — own combined run: RAN CLEAN (coverage comparison below)
- File: verify/combined-check.sql = migration lines 1-1963 (commit; dropped) + check script without its line 65 `begin;` and line 1493 `rollback;` + `rollback;`. Only transaction statements in it: line 388 `begin;`, line 3456 `rollback;`.
- psql exit 0; last lines `NOTICE: chat-check: all 200 cases passed. Nothing is kept: ROLLBACK follows.` / `DO` / `ROLLBACK`.
- 200 `chat-check ok:` lines; 9 WARNING lines, all contain "deliberate failure"; 0 ERROR / FAILED lines. (verify/combined-check.out)
- Cases that ran (200): fixture x7, A1-A10 (A7/A8 x5), B1-B34, C1-C16, M1-M14, C17-C32, T1-T6, C33-C48, D1-D15, X1-X7, D16-D31, E1-E23, F1-F12.
- Gate 2 comparison (contract section 11), one by one — I read the statements in the script, not only the labels:
  - member: Board top-level refused = B8 (insert as authenticated + member's claims -> 42501); mod too = B9
  - reply accepted = B3 (member), B4 (officer)
  - kind = 'poll' refused = B10 (42501)
  - media refused = B11 (42501)
  - closed event room refused = C30 (member), C31 (officer), C32 (can_post_org_channel)
  - own club-room row cannot be deleted = B24 (accepted_at -> null ok 1), B25 (delete 'ok 0'), B26 (row still there)
  - non-member with an RSVP: event room invisible = C6 (channels read 0 + can_view false), C21
  - after leaving: rows gone = D2, D3 (leaver deletes own org_members row as authenticated)
  - after re-joining: rows back = D6, D7
  - a removal deletes RSVPs and rows = D8, D9
  - chat_repair_club twice changes nothing = D13, D14 (fingerprint of rooms + rows incl. read marks), X7
  - RSVP by a non-member succeeds, writes no row = C4, C5
  - going -> no -> going as the member (role authenticated) = C8-C13
  - event created through POST /api/events = C1-C3, SQL stand-in (service-role INSERT); script header says so (STILL TO RUN OVER HTTP)
  - event with 2 RSVPs and 3 messages cancelled through the route = C41-C47, SQL stand-in (DELETE ... RETURNING id as the officer); script says so
  - member -> admin -> member = C33-C40
  - a club is deleted = F10-F12
  - a user with RSVPs and messages is deleted = F1-F9
  - RESULT: every gate 2 case is exercised. The only gap is the HTTP layer of three cases (POST /api/events, PUT rsvp, DELETE /api/events/[id]); the script names them.

## Step 3 — seed rows, read-only: MATCHES contract section 8
- sae: 1 member = avery_owner, role owner, and orgs.owner_id is that user. Channels: general (private, pos 0, 3 messages, all 3 by the owner, 0 replies, 0 media), announcements (public), events (public), exec (private). 0 events. Owner holds 2 rows (announcements, events) = production's shape.
- chat_seed_club: owner avery_owner + emery_admin (admin) + casey_purdue (mod) + blake_iu (member) = 3 besides the owner, 1 admin, 1 mod. general public: 3 top-level messages + 1 reply (4 rows). announcements public: 1 message, written by blake_iu (member). Events: Game Night (upcoming, ends 2026-10-05 01:00 UTC), Cookout (ended 3.85 days ago, inside the window), Callout (ended 10.85 days ago, outside). RSVPs: blake_iu going, casey_purdue maybe, both on Game Night. 0 channel_members rows (as the repaired seed intends: the migration's step 7 writes them).
- Other clubs: test_bloomington_cycling (0 members, 0 channels, 1 event), test_hidden_club, test_invite_club, test_open_club, test_request_club. One RSVP by a non-member (blake_iu on test_open_club's Study Night).

## Step 4 — attacks: design (file verify/attack-body.sql, run after the migration body, then rollback;)
- Actors from the seed: avery_owner (owner), emery_admin (admin), casey_purdue (mod), blake_iu (member, Going on Game Night), vibe_review (not in the club).
- Facts read first: authenticated has NO INSERT on channel_members and UPDATE only on 7 state columns; rsvps_update_own lets a student change event_id; can_read_channel_roster goes through can_view_org_channel.
- Cases: (a) RSVP moved by plain UPDATE, (b) Board post with replies deleted by its author, (c) repair twice for every club (also after deliberate damage), (d) stray row for a non-member, (e) Officers roster as a member, (f) repair called as authenticated, plus my extras (g) self-insert into an event room, (h) moving own row to another room, (i) seeded non-member with an RSVP.

## Step 4 — attacks: run (verify/combined-attack.sql -> combined-attack.out), psql exit 0, ends ROLLBACK
- Only ERROR line in the output: line 536 `ERROR: 42501: not allowed` = the expected refusal of (f). 0 WARNING lines.
- (a) CLEAN. blake (member, Going on Game Night), role authenticated, `update rsvps set event_id = <Verify Night>`: UPDATE 1. Right after, through RLS blake reads only the room "Verify Night"; can_view old room f / new room t; row on Game Night gone, row on Verify Night there. Write in old room: REFUSED 42501; write in new room: ok 1; messages read in old room: 0.
  - a2 moved to Cookout (ended, room open): row follows. a3 moved to Callout (no room): no row anywhere. a4 moved to another club's event (not a member): no row, room not readable. a5 back: row back. a6 moved + status no: no row on either. a7 hand RSVP to casey: REFUSED 42501. a8 restored.
- (b) CLEAN. Owner's Board post + 3 replies (member, mod, admin quoting the member's reply): before 1 post / 3 replies. blake (not the author) deletes: ok 0. avery (author), role authenticated, plain DELETE: DELETE 1 -> post 0, replies 0, no "verify: reply" message anywhere. b2: the member-written Board message from before the migration, owner replies under it (ok 1), blake deletes his post (ok 1): post 0, replies 0.
- (c) CLEAN. Fresh state: before / after run 1 / after run 2 identical (31 channels, 39 rows, channels_md5 8c7d084e..., rows_md5 c6735227..., fingerprints include ctid so not even a same-value UPDATE happened). With damage (lost Lounge row, lost Officers room, lost event room, a pending row): 29 / 36 -> run 1 as service_role -> 31 / 39 and all four mended -> run 2: identical to run 1 (1ee6a00c... / c24c76bc...).
- (d) CLEAN. vibe_review (no membership) given rows by hand on Lounge, Officers and the Game Night room. As them: rooms seen 0, messages 0, roster rows 0, write in Lounge REFUSED 42501 (the rows open nothing). After chat_repair_club(club): outsider rows left 0; the 4 members' Lounge rows still there.
- (e) CLEAN. e1 as blake: `select * from channel_members where channel_id = <Officers>` -> 0 rows; room seen 0; messages 0; can_view f. e2 with 2 officer rows + 1 message written in: member 0, mod 0, outsider 0, owner 2, admin 2 (positive control); messages member 0 / owner 1. e3 even with a by-hand row of his own on Officers: rows 0, room 0, messages 0, write REFUSED 42501.
- (f) CLEAN. Raw call as blake/authenticated: `ERROR: 42501: not allowed` (CONTEXT chat_repair_club line 4 at RAISE). After rollback to savepoint: same backend pid as before and as at the start, role postgres, the session went on for ~60 more statements. Helper: member, owner, signed out (anon), null arg, unknown club: all REFUSED 42501; service_role ok 1. Fingerprint before = after.
- extras: (g) own row insert on event room / Officers: 42501 permission denied for table channel_members. (h) moving own row or handing it over: 42501. (h2) member making Officers public / changing kind / creating a room: 42501; deleting the Board: ok 0 (nothing deleted). (i) seeded non-member with Going RSVP (blake, Open Club Study Night): room exists, no row, room not seen, can_view false, write refused. (j) a member asking can_view/can_post about the owner's id: false.
- Database log (docker logs, last 45 min): no FATAL / PANIC / "terminated by signal"; postmaster start time still 2026-09-24 03:16 UTC (no restart). No chat-rooms WARNING without "deliberate failure".

## Step 5 — no leftovers: CLEAN
- New columns: 0 rows. chat_ / can_post_org_channel / my v_ helpers in any schema: 0. can_view_org_channel md5 269c1185295552f74930f1acffd7c170, org_members_drop_club_access 0e7baa973042be8ca0decb7df1ca6407 (the pre-migration bodies). Same 6 triggers. 0 of the file's constraints, 0 of its indexes. Policies do not mention kind or can_post_org_channel.
- Schemas: the 12 Supabase ones, no scratch schema; nothing lives in a pg_temp schema.
- Counts 15 / 6 / 10 / 3 / 8 / 11 / 7 / 7 / 7 and all five md5 fingerprints identical to the baseline taken before step 1.
- 0 "Verify Night" events, 0 verify:/chat-check: messages, 0 chat-check users. No open transaction, no prepared transaction.
- Repo: git status unchanged (M seed, ?? three new files); md5 of the four B1a files identical to the start.

## Extra (not asked): the after-deploy script on a rolled-back migrated state
- verify/combined-after-deploy.sql: fresh state -> `summary | 0 findings in 0 clubs; 7 clubs, 29 club rooms checked`. After one stray row (non-member on the Lounge) and one lost row (blake's Board row) -> extra_row + public_room_row + `2 findings in 1 clubs`. ROLLBACK.
- One slip of mine, no harm: the first build of that scratch file had a broken `\echo` line (zsh echo ate the backslash); psql stopped at it with exit 3 inside the open transaction, which the closing connection rolled back. Rebuilt with printf, ran clean.

## Final leftover check (after every run, 16:4x EDT): CLEAN
- new_columns 0, chat functions 0, can_view md5 269c1185..., 6 triggers, 12 schemas (no scratch schema), 0 temp objects, counts 15/6/10/3/8/11/7/7/7, all five md5 = baseline, 0 open transactions.
- Repo: git status and the four md5 unchanged. I wrote only verify/ files and this log.

## VERDICT: PASS (steps 1, 2, 4 clean; step 2 covers every gate 2 case; the only gap is the HTTP layer of three cases, which the script names)

## Notes for the orchestrator (not failures)
1. The task text describes the run-1 files (160 cases, ~1,500 lines). On disk are the repaired ones: migration 1,964 lines, check script 200 cases, 9 deliberate warnings. Expect "all 200 cases passed" after the real apply.
2. The file differs from the contract's wording in four places, all listed in B1a-repair.md and all needed by the attacks the task asked for: chat_rsvps_room fires on ANY update (contract 3.4: UPDATE OF status); chat_repair_club has steps 5 and 6 (contract: 4 insert-only steps); three functions pin TimeZone to UTC; the after-deploy script lists five more things than 3.10 names. The contract file still has the old wording.
3. Still to run over HTTP after the real apply (gate 2 words them as route calls): POST /api/events as an officer; PUT /api/events/[id]/rsvp as a member and as a non-member; DELETE /api/events/[id] on an event with 2 RSVPs and 3 room messages.
4. The seed's column-present path ("already migrated") has never run; it can only run after the real apply.
5. Seen in passing, outside B1a: rsvps_update_own lets a student move an RSVP onto an event that already ended (a2, a3) and onto an event of a club they are not in (a4). No room access comes from it.
