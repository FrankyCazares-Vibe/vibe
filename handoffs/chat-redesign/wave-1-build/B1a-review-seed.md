# B1a review — lens: THE SEED (read-only reviewer)

Running log. Reviewer changes no file but this one.

- [start] Read contract 3.0-3.10, 8 (seed bullet), 11, 12; B1a-notes.md; git diff of scripts/local-seed.mjs.
- [db read] Local db is still un-migrated (channels.kind absent). Rows the seed left: sae (1 member = owner avery; general private 3 msgs 0 rows; announcements public 1 row; events public 1 row; exec private 0 rows) and chat_seed_club (owner + emery admin + casey mod + blake member; general 4 msgs of which 1 reply; announcements 1 msg by blake; 6 room rows; 3 events; 2 RSVPs). Matches contract section 8 row by row.
- [candidate] chat_seed_club's 3 non-owner members hold 6 room rows (ensureMember mirrors admitMember). Production (asis 11.5): every non-SAE club has 0 rows. To be written up.
- [candidate] B1a could not run the column-present path; tracing it by hand against the migration's triggers next.
- [read] B1a scratch seed-run-1.txt = seed-run-2.txt (diff empty); fingerprints after run 1 = after run 2 = final. Second run on the SAME day is a no-op. Events are re-dated on every run (old behaviour), so a run on a LATER day is not.
- [read] Migration triggers 4.1-4.6 read. chat_events_room fires on INSERT or UPDATE OF title only; the seed's event update never sends title.
- [candidate] Clock: "Invite Club Welcome Mixer" (inDays -7) always sits 1 to 25 hours inside the 7-day window; Cookout 3 to 4 days. A real apply on a later day than the last seed run gives other counts than the header, and the seed run after the apply then moves an event INTO the window with no room.
- [candidate] Header says "seeded with scripts/local-seed.mjs: 7 clubs ... 11 memberships": one club, one membership, two events and one RSVP are leftovers of manual tests, not the seed.

## Second pass (resumed 12:27 UTC, Sept 29)

- [db read] channels.kind still absent; no chat_* function. schema state unchanged since B1a's FINAL STATE.
- [verified] Header counts "15 rooms, 25 rows" recomputed by hand from the rows in the db: 6 Officers + Lounge/Board of test_bloomington_cycling + 7 event rooms = 15; 13 public-room rows + 12 event-room rows = 25. True ONLY while "Invite Club Welcome Mixer" (ends 2026-09-23 01:00Z) is inside its window, i.e. until 2026-09-30 01:00Z, or after a fresh seed run the same UTC day.
- [verified] Seed rows vs contract 8: sae = 1 member (owner avery), general private 3 msgs by avery, announcements public, events public, exec private, 0 allow-list rows, owner rows on announcements + events only. chat_seed_club = owner + emery admin + casey mod + blake member; general 3 top-level + 1 reply (casey -> blake's "ride"); announcements 1 msg by blake (plain member); Game Night +5d with blake going / casey maybe; Cookout ended 3d12h ago; Callout ended 10d12h ago. Matches.
- [verified] Not from the seed (manual leftovers, asis 7.1-7.5): club test_bloomington_cycling (0 members, 0 channels, event "Lake Monroe ride (test)"), avery's plain membership of test_request_club, event "S68 Phone Check", blake's going RSVP to test_open_club as a non-member.
- [verified] Detection: GET local PostgREST /rest/v1/channels?select=kind&limit=1 (service key from `supabase status`) answers HTTP 400 {"code":"42703","message":"column channels.kind does not exist"} -> detectRoomKinds() returns false. Correct on this database.
- [read] POST-CHECK 9.2 picks its probe member with `order by (m.role = 'member') desc, m.joined_at`: locally that is avery in test_request_club (joined 03:31:54, a manual leftover), NOT a member of chat_seed_club (joined 11:35:08). The rehearsal's behaviour probe never ran in the club the seed built.
- [traced by hand] Column-present path, database migrated by backfill: owner upserts fire chat_org_members_rooms (UPDATE OF role) with was_officer = is_officer -> nothing; rooms found by kind -> no insert; ensureMember row upserts ignoreDuplicates -> nothing; messages found by (room, author, content); RSVPs equal; events UPDATE has no title -> chat_events_room does not fire. Same UTC day = no-op.
- [sql, read-only] Event rooms step 7 would create, by apply time: now (Sept 29 12:35Z) = 7; from 2026-09-30 01:00:01Z = 6 (the Mixer has left its window). Window edges of the seeded events: Mixer closes 2026-09-30 01:00Z (12h24m left), Cookout 2026-10-03 00:00Z, Callout closed Sept 26.
- [scratch, rolled back] temp tables + triggers: `insert .. on conflict do update set role = excluded.role` fires AFTER UPDATE OF role (old.role = new.role = owner); `update .. set ends_at` does NOT fire AFTER UPDATE OF title. So after the apply the seed can move an event into its window and nothing creates the room.
- [checked] node --check and eslint on scripts/local-seed.mjs: clean.
- [db read] avery_owner is_platform_admin = true (the seed never sets it: a manual leftover). blake_iu has BLOCKED casey_purdue (public.blocks, 1 row, leftover). can_publish_now / can_view_org_channel / org_member_role do not mention is_platform_admin, so the probe's result stands; only its subject is not a plain student.

## FINDINGS (written one by one)

### F1 (medium) The seed can move an event INTO its 7-day window after the apply, and nothing gives it a room
- File: scripts/local-seed.mjs:608 (`inDays: -7`), :626-641 (ensureEvent re-dates on every run), :565.
- Evidence: window edges read from the db (Mixer closes 2026-09-30 01:00Z, 12h24m after my read); SELECT by apply time: 7 event rooms now, 6 from 2026-09-30 01:00:01Z. Scratch trigger test: an UPDATE of ends_at does not fire AFTER UPDATE OF title. chat-v2-after-deploy.sql `event_room` arm lists exactly this state.
- Effect: (a) a real apply later than 01:00Z Sept 30 without a seed run the same UTC day creates 14 rooms and 23 rows, not the header's 15 and 25; (b) the seed run B1a asks for AFTER the apply re-dates the Mixer to end Sept 24 01:00Z (inside the window, no room), so the after-deploy check then reports 1 finding that is not a migration fault; the same happens to the Cookout if the apply is later than 2026-10-03 00:00Z.
- Change: line 608 `inDays: -7` -> `inDays: -5` (always 4 to 5 days past its end, never near the edge); and in the column-present path, after the events are written, call the repair for every seeded club: `for (const id of Object.values(clubs)) must(await admin.rpc("chat_repair_club", { p_org: id }), "repair club chat");` inside `if (HAS_KIND)`. Gate 2 wording: run the seed the same UTC day as the rehearsal and the apply.

### F2 (medium) chat_seed_club is not "the shape of every other club": its members already hold their rows
- File: scripts/local-seed.mjs:546 (`ensureMember` for CHAT_MEMBERS), :379-399 (ensureMember writes a row per public channel).
- Evidence: channel_members read: emery, casey and blake each hold a row on chat_seed_club general AND announcements (6 rows). asis 11.5: every production club but SAE has 0 subscription rows, the two with 2 members included. SELECT of the (member, public room) pairs step 7 must create locally: 13 rows, 11 of them owners'; the only one below admin is avery in test_request_club, a manual leftover (and a platform admin).
- Effect: with the seed alone the backfill never writes a public-room row for a mod or a plain member, which is what it does for production. The member who also gets an event-room row (blake, going) never gets a public-room row from the backfill.
- Change: line 546 -> `for (const m of CHAT_MEMBERS) { if (HAS_KIND) await ensureMember(clubs[m.club], users[m.user], m.role); else must(await admin.from("org_members").upsert({ org_id: clubs[m.club], user_id: users[m.user], role: m.role }, { onConflict: "org_id,user_id" }), `membership ${m.role}`); }`. Local database, once, before the rehearsal (orchestrator): `delete from public.channel_members cm using public.channels c, public.orgs o where c.id = cm.channel_id and o.id = c.org_id and o.handle = 'chat_seed_club';` (6 rows). Header: step 7 then creates 31 rows, not 25.

### F3 (low) The header credits the seed with rows the seed did not write; the behaviour probe ran on one of them
- File: supabase/migrations/20261001100000_chat_v2_rooms.sql:69-73; probe order at :1391-1396.
- Evidence: counts-before-seed.txt (orgs 5, org_members 6, events 5, rsvps 1) + seed = 7 / 11 / 8 / 3. Not in the seed: club test_bloomington_cycling (0 members, 0 channels: "the Lounge and Board of a club that had no channel"), avery's membership of test_request_club, events "Lake Monroe ride (test)" and "S68 Phone Check", blake's going RSVP to test_open_club as a non-member, avery's is_platform_admin, blake's block of casey. Probe picks `order by (m.role = 'member') desc, m.joined_at`: avery/test_request_club (03:31:54) before blake/chat_seed_club (11:35:08).
- Effect: a stack rebuilt from the seed gives 6 clubs, 10 memberships, step 7 = 10 rooms and 22 rows, no club without channels, no non-member RSVP; the header's numbers cannot be reproduced.
- Change (wording, lines 69-73): "Local rehearsal (2026-09-29; the local database = scripts/local-seed.mjs PLUS leftovers of manual tests: the club test_bloomington_cycling with no member and no channel, one extra membership, two events, one non-member RSVP; 7 clubs, 14 club channels, 11 memberships): ...". Add: "The behaviour probe ran as avery_owner, a member of test_request_club."

### F4 (low) No RSVP sits on an ended event, which is the only kind production has
- File: scripts/local-seed.mjs:483-486 (CHAT_RSVPS).
- Evidence: SELECT by window state: upcoming 5 events / 3 going-or-maybe; ended inside the window 2 events / 0; ended past the window 1 event / 0. asis 11.6: production has 0 upcoming events, 3 ended inside the window, 7 going/maybe RSVPs.
- Effect: locally the backfill writes an RSVP holder's row only on the room of an upcoming event; "an RSVP to an event past its window gives no room and no row" is true locally only because no such RSVP exists. The seed does what contract 8 lists; the list leaves this out.
- Change (an addition to contract 8, needs the orchestrator's yes): add `{ club: "chat_seed_club", title: "Chat Seed Cookout", user: "B", status: "going" }` and `{ club: "chat_seed_club", title: "Chat Seed Callout", user: "C", status: "going" }` to CHAT_RSVPS. Step 7 then writes 1 row more (blake on the Cookout room); the Callout still has no room.

### F5 (low) Backfill steps 2.4 and 2.5 match 0 rows locally
- File: supabase/migrations/20261001100000_chat_v2_rooms.sql:556-570; seed CHAT_CLUBS at scripts/local-seed.mjs:429-439.
- Evidence: rehearsal-final.out prints `UPDATE 0`, `UPDATE 0` for 2.4 and 2.5; SELECT: 0 private and 0 custom club channels outside sae. Production today is the same (asis 11.5), so the numbers agree, but "the first private channel -> officers" and "the rest -> room" have never changed a row in any rehearsal.
- Change: no seed change (contract 8 fixes the two clubs). One more rollback-only variant in B1a's rehearsal-variants: before the file's body, `insert into public.channels (org_id, type, name, is_private, position) select id, 'org_channel', 'board-room', true, 2 from public.orgs where handle = 'chat_seed_club'; insert into public.channels (org_id, type, name, is_private, position) select id, 'org_channel', 'rides', false, 3 from public.orgs where handle = 'chat_seed_club';` and expect kind officers (renamed) and kind room with 4 rows.

### F6 (low) After a rollback of migration A the seed doubles every club's rooms
- File: scripts/local-seed.mjs:85-92 (detection), :305-315 (findRoom by name when the column is absent).
- Evidence: migration header :98-103: the ROLLBACK drops channels.kind and keeps the renames (lounge, board, officers). The seed then reads "column absent", looks for `general` / `announcements` / `exec` by name, finds none, and inserts them again in all 6 seeded clubs (13 new channels), and the 8 chat messages again (ensureMessage is keyed on the room). A second apply is refused by PRE-FLIGHT anyway (names board / lounge / officers are taken), so the only way forward is the backup; the seed should not dig the hole deeper.
- Change, right after `const HAS_KIND = ...` is used first (top of main()): `if (!HAS_KIND) { const renamed = await count("channels", (q) => q.eq("type", "org_channel").in("name", ["board", "lounge", "officers"])); if (renamed > 0) { console.error("Refusing to seed: channels.kind is absent but club rooms are already named board, lounge or officers (migration A was rolled back and its renames stay). Restore the local backup first."); process.exit(1); } }`

### F7 (low) On a database that was migrated BEFORE it was seeded, the seed writes a member's top-level Board post
- File: scripts/local-seed.mjs:468-471 (the message), :553-562 (the loop), :515.
- Evidence: read. With HAS_KIND the row is inserted by the service role into the room of kind board, author blake (role member), thread_root_id null: the one thing the Board rule forbids. It is part of "the pre-migration shape" the contract says the column-present path skips. On the backfilled local database the message already exists, so nothing is written there.
- Change: give that entry `before: true` and start the loop body with `if (HAS_KIND && msg.before) continue;`.

### F8 (low) The column-present path has never run; what to compare when it first does
- Evidence: B1a-notes.md ("could not be run by B1a"); my trace by hand found no write on a backfilled database the same UTC day (owner/member upserts fire chat_org_members_rooms with no status change; rooms found by kind; messages and RSVPs found; events UPDATE without title).
- Change (orchestrator, around the first run after the apply): run before and after, expect the same line: `select (select count(*) from public.channels) ch, (select count(*) from public.channel_members) cm, (select count(*) from public.messages) msg, (select count(*) from public.rsvps) rsvp, (select count(*) from public.events) ev, (select count(*) from public.org_members) om, (select md5(string_agg(id::text || kind || name || is_private::text, ',' order by id)) from public.channels where org_id is not null) rooms_md5, (select md5(string_agg(channel_id::text || user_id::text, ',' order by channel_id, user_id)) from public.channel_members) rows_md5;` and then scripts/sql/chat-v2-after-deploy.sql (0 findings; see F1 for the one case where it is not).

### F9 (low, optional) The migrated local database has no CLOSED event chat
- Evidence: the backfill gives no room to "Chat Seed Callout" (past its window) and the seed re-dates "Chat Seed Cookout" to 3 days ago on every run, so its room never closes. B4's `room_closed` and B5's "This chat is closed." bar (contract 10.1) have nothing to be looked at on.
- Change: in the column-present path, after the events: when no channel has event_id = the Callout's id, insert `{ org_id, type: "org_channel", kind: "event", event_id, name: "Chat Seed Callout", is_private: true, position: 1000 }` (chat_channels_subscribe adds the officers' rows). The after-deploy check does not look at events past their window.

## CHECKED, NO FINDING
- Detection (42703 read live from local PostgREST); column-absent rows = contract 8, row by row; second run the same day (B1a's two outputs are byte-identical, fingerprints equal, and the db still holds those counts: 7 / 11 / 15 / 12 / 10 / 8 / 3); old test clubs: the only changed hunk is the room loop, and the inserted row has the same four fields as before (no `kind` leaks onto an un-migrated database); node --check and eslint clean.
- [done] Review finished; nothing but this file was written; no migration or rehearsal was run.
