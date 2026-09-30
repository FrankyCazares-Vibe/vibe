# B1a review — lens: SQL correctness (read-only reviewer)

Running log. Scratch: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1/review-sql

- [start] Read contract 3.0-3.10 and B1a-notes.md. Migration not applied locally (channels.kind absent per B1a notes). Reading the migration next.
- [read] Migration read end to end (1516 lines). Local db is NOT migrated (channels has no kind; 14 club channels, 7 clubs, 8 events). Catalog read: channels.type / is_private / name are NOT NULL (the CHECKs have no NULL hole there); no unique index on (org_id, name); channel_members.role CHECK allows 'member'; rsvps.status in going/maybe/no. Every column named in the five trigger bodies and chat_repair_club exists.
- [plan] Experiments run ONLY on hand-built tables in a scratch schema inside begin..rollback (no LIKE public.*, so no lock on a real table).
- [resume] Second sitting (the first was interrupted). Re-read contract 0-3.10, 8, 11, 12 and the whole migration (1516 lines). Statement order 3.1 -> 3.9 holds. Catalog and data reads next; experiments only in a scratch schema inside begin..rollback.
- [catalog] No trigger on channels / channel_members / rsvps / events today; every existing trigger function on messages, org_members, orgs sets its own search_path, so the new search_path '' functions cannot break a nested trigger. events.ends_at / title, rsvps.status, org_members.role are NOT NULL: no NULL hole in the window tests. postgres owns the tables and has bypassrls.
- [scratch] Harness from the first sitting (schema rv, hand-built tables) still matches the migration (file mtime 08:08, copies 08:20). Production-shaped fixture: backfill + repair give 19 rooms / 20 rows; second repair changes 0 rooms, 0 rows.
- [read] can_view_org_channel in the file = the live body + the one arm (diff of pg_get_functiondef against lines 1004-1029: only the 4 new lines). The ROLLBACK copy in the header = the live body. rehearsal file = migration except the last line. Policy texts = contract 3.6. CHECKs = contract 3.3. Trigger bodies = the 3.4 table, row by row. chat_repair_club = the four steps, insert-only, idempotent on the production-shaped fixture.
- [scratch exp-b] One INSERT of four rows without kind (general private, announcements, general private, lounge): row 1 -> lounge PUBLIC with every member subscribed, row 3 -> room, row 4 -> a room NAMED lounge. can_post as the session role: uid null f, unknown room f. Empty event title -> room name ''. 100 x 'é' -> 80 characters.
- [scratch exp-c] CHECK / unique matrix, 19 statements: every CHECK refuses what it should (23514), no NULL hole; a dm sent with a kind is stored without one; second Lounge / second event room = 23505 plain, 0 rows and no error with ON CONFLICT DO NOTHING (the partial indexes are honoured without a conflict target). Nothing ties an event room's org_id to its event's club (a room of kind event for a personal event is accepted); only the trigger and the repair write such rows, both from e.org_id.
- [scratch exp-d] 449 random club shapes (SAE with/without exec, private general/announcements, ties on position and created_at): the PRE-FLIGHT's guess (0.f) named exactly the channels the backfill turned into Officers in all 449; no unique violation from channels_one_core_room.
- [catalog] authenticator preloads safeupdate (UPDATE/DELETE without WHERE raise): every UPDATE / DELETE inside the five trigger functions has a WHERE. OK.
- [code read, HEAD] Every writer of channel_members for club rooms upserts with ignoreDuplicates (membership.ts:232, subscribe-public:84), so rows the triggers wrote first cause no 23505. The old send route sends media_url / media_kind as null and no kind: the new WITH CHECK accepts a plain message from old code. Its "bare retry" regex (/attachment|media|column/) does not match the RLS refusal text, so a refused Board post is not retried. The event edit route refuses ended events and a changed org_id, so no route moves an old event back into its window.
- [scratch exp-e] With every DELETE on channel_members failing (swallowed, 3 WARNINGs): RSVP going -> no, admin -> member, room -> private. After chat_repair_club: 5 rows that should be gone are still there; can_view_org_channel still answers true for the member with RSVP no AND for the demoted admin. The repair has no DELETE and the after-deploy script has no list for it.

## Verdict (lens: SQL correctness)

No high and no medium finding. Read line by line against contract 3.0-3.9 and run in pieces on scratch tables: statement order, the 9 CHECKs (no NULL hole), both partial unique indexes, every ON CONFLICT, the six backfill steps on the local and the production shape, the five trigger bodies against the 3.4 table, chat_repair_club (four steps, insert-only, second run changes nothing), both functions, the three policy texts. Every identifier inside the function bodies exists in the catalog; every name is schema-qualified. The migration was NOT run and no real table was changed by this review.

## Findings

### F1 (low) What a swallowed DELETE leaves behind is invisible: the repair has no DELETE and the after-deploy script has no list for it
- Where: supabase/migrations/20261001100000_chat_v2_rooms.sql:725, 793-802, 858-859 (the three DELETEs inside exception-wrapped bodies), 925-991 (chat_repair_club, INSERTs only); scripts/sql/chat-v2-after-deploy.sql:12-14, 31 ("run this again whenever the log shows chat-rooms: ... failed", "0 = whole").
- Evidence: scratch exp-e. With every DELETE on channel_members failing: RSVP going -> no, admin -> member, room -> private gave 3 WARNINGs; after chat_repair_club 5 rows that should be gone were still there, and can_view_org_channel answered true for the member with RSVP no and for the demoted admin. The four lists of the after-deploy script are all "something is missing" lists, so it would print "0 findings".
- The contract accepts the cost for chat_rsvps_room (3.4, members only). It does not name the demoted officer, and the after-deploy header promises more than the script reads.
- Change (after-deploy script only, read-only): add a fifth list and say in the header that chat_repair_club does not fix it (the fix is a DELETE, with Franky's yes):
    stale_row as (
      select 'stale_row'::text, o.id, o.handle, c.name, c.id, c.event_id, cm.user_id,
             case when m.user_id is null then 'not a member of the club'
                  else 'event room: no going/maybe RSVP and not an owner/admin' end
        from public.channel_members cm
        join public.channels c on c.id = cm.channel_id
        join public.orgs o on o.id = c.org_id
        left join public.org_members m on m.org_id = c.org_id and m.user_id = cm.user_id
       where c.type = 'org_channel'
         and (m.user_id is null
              or (c.kind = 'event' and m.role not in ('owner', 'admin')
                  and not exists (select 1 from public.rsvps r
                                   where r.event_id = c.event_id and r.user_id = cm.user_id
                                     and r.status in ('going', 'maybe'))))
    )
  plus "union all select * from stale_row" in findings, and for those rows the fix column should read 'delete the row (needs a yes)' instead of the repair call.
- Also for F1 (scratch exp-f): with every write to channels failing, an event INSERT and a title UPDATE still succeed (WARNING only), the repair then creates the room with the current title. A title change swallowed LATER leaves the room with the old name (event "Formal 3", room "Formal 2") and the repair does not rename. Same fix: one more after-deploy list, event rooms where c.name is distinct from left(e.title, 80).

### F2 (low) The database lets an extra room carry a core room's name, and nothing lists it afterwards
- Where: migration:652-666 (chat_channels_fill_kind: anything that is not general / announcements becomes a room, whatever its name); scripts/sql/chat-v2-after-deploy.sql (no list).
- Evidence: scratch exp-b, one INSERT of four rows without kind: the fourth row (name lounge) is stored as kind room, name lounge, public, every member subscribed. The PRE-FLIGHT refuses such names BEFORE the apply (migration:378-385) and B1b's routes refuse them AFTER the deploy; between the two (old create-room route, 3.10 window) nothing does. The old modal can also rename a Board or Lounge in the window.
- Change (after-deploy script, read-only), a list "room_name":
    select 'room_name'::text, o.id, o.handle, c.name, c.id, null::uuid, null::uuid,
           'kind ' || c.kind
      from public.channels c join public.orgs o on o.id = c.org_id
     where (c.kind = 'room' and lower(btrim(c.name)) in ('board', 'lounge', 'officers'))
        or (c.kind in ('board', 'lounge', 'officers') and c.name is distinct from c.kind)
  No change to the trigger (the contract says it never raises).

### F3 (low) chat_channels_fill_kind turns a channel old code asked to be PRIVATE into a public room with every member subscribed
- Where: migration:652-663 (new.is_private := false on the general / announcements arms).
- Evidence: scratch exp-b, row 1: sent (general, is_private true), stored (lounge, public), 2 rows written by chat_channels_subscribe. It is what contract 3.4 says ("lounge / name lounge / public"), so it is not a breach; it is only reachable when the club has no Lounge (or Board) at that moment, which after step 7 means someone deleted it with the old desktop modal inside the apply window.
- Change: none without the orchestrator's word, because it changes a contract sentence. If wanted, the smallest form is one more term on each arm:
    if new.name = 'general' and new.is_private = false and not exists (...)
    elsif new.name = 'announcements' and new.is_private = false and not exists (...)
  so a private channel sent without a kind stays a private room. Else: add the row to the 3.10 window table.

### F4 (low) The behaviour check breaks only INSERTs; the DELETE side and chat_events_room failing are not exercised
- Where: scripts/sql/chat-v2-rooms-check.sql:908-916 (the deliberate failure is "before insert on public.channel_members"), cases E1-E8.
- Evidence: scratch exp-e and exp-f ran what is missing: with DELETEs failing, RSVP going -> no, admin -> member and room -> private all succeed (3 WARNINGs); with writes to channels failing, an event INSERT and a title UPDATE succeed (1 WARNING each). The migration behaves; the script does not prove it.
- Change: in section E add "or delete" to the break trigger on channel_members and a second break trigger "before insert or update on public.channels", with the five cases above expecting 'ok 1'.

### F5 (low, wording) Header says the file touches no grant; it restates three
- Where: migration:40-41 ("DOES NOT: touch any SELECT policy, any grant ...") against :996, :1033, :1081 (GRANT EXECUTE on three functions).
- Change: "any table grant" (the three GRANT EXECUTE lines only restate the default ACL, standing rule 20260922090000).

## Not findings (checked, fine)
- PRE-FLIGHT 0.f against what the backfill picks: 449 random shapes, 0 differences (exp-d).
- can_view_org_channel: live body + the one arm, nothing else; the ROLLBACK copy is the live body.
- ON CONFLICT DO NOTHING without a target covers both partial unique indexes (exp-c 12, 15).
- Multi-row INSERT without kind: the BEFORE ROW trigger sees the rows before it in the same statement (second general -> room, no 23505).
- safeupdate (loaded for PostgREST sessions): no UPDATE / DELETE without WHERE in any function body.
- Old code after the apply: room-row writers upsert with ignoreDuplicates; the send route's insert row passes the new WITH CHECK.
- The relayed answers of Sept 29: (1) people who already RSVP'd join event rooms = step 7, members only; (2) blocks in club rooms: nothing in migration A builds or prevents it (wave 1 only reserves `hidden`, outside these four files). The Board exception written in contract 12.2 is not in the relayed words; confirm it with Franky before the wave that builds it.

---
## Third sitting (run 2, "try again")
- [resume-3] Notes above are from an earlier attempt and are NOT trusted blindly. Read the 33 titles of the four finished lenses (seed, rollout, triggers, security). F1, F2, F3, F5 above repeat what those lenses already reported (stale rows, renamed core room, private general -> public Lounge, the grant wording); they will not be reported again. Re-reading contract 3.1-3.9 and the migration from line 1, looking for what all five missed.
- [read-3] Migration re-read 1-1516 against contract 3.0-3.9. Statement order holds. Trigger bodies, repair, both functions and the three policy texts match the contract text. Now the catalog: every identifier in the function bodies, NOT NULL columns without defaults on channels / channel_members, the conflict target, FK deferrability, triggers on messages (the fixture insert fires them).
- [catalog-3] Re-read the catalog: every column the five trigger bodies, chat_repair_club and both functions name exists with the type used; channel_members has UNIQUE (channel_id, user_id) (the conflict target); no FK is deferrable (no "pending trigger events" before the ADD CONSTRAINT); no table has FORCE RLS; postgres is NOT superuser locally but has bypassrls (same as production). Scratch harness of the earlier sitting regenerated from the current file: identical. Next: the probes of POST-CHECK 9.2 against the trigger messages_check_media_ref, then new scratch experiments.
- [read-3] Check script (1105 lines) and after-deploy script read for SQL semantics: no vacuous case found (the media probe cannot be answered by messages_check_media_ref, which raises 23514, not 42501; upserts use the PostgREST SET list). Seed diff read. Nothing new to report there beyond the seed lens.
- [idea-3] Candidates still open, to be run on scratch: (a) `ends_at + interval '7 days'` depends on the session TimeZone (PostgREST accepts Prefer: timezone=); (b) events.org_id changed after the room exists; (c) what the old send route's reply (parent_message_id, no thread_root_id) does on a Board; (d) the restated ROLLBACK text of messages_insert_member against the live text.
- [proof-3] The builder's proof belongs to the files as they are now: the combined file holds the current migration body and the current check body byte for byte (python substring test), the rehearsal copy = the migration with the last commit; -> rollback;, combined-final.out = 160 "chat-check ok" + the 4 deliberate WARNINGs. So every branch of the five trigger bodies, the repair and can_post_org_channel has run once on the real tables inside a rolled-back transaction: no run-time identifier error is left to find by reading.
- [tz] `timestamptz + interval '7 days'` is computed in the session TimeZone. Read-only query: '2026-10-28 23:00+00' + 7 days = 2026-11-04 23:00 UTC in a UTC session, 2026-11-05 00:00 UTC in an America/Indiana/Indianapolis session (US clocks go back on Nov 1). None of the new functions pins TimeZone; PostgREST v14.5 (local image) accepts Prefer: timezone=. Proving it on the scratch copy of can_post_org_channel next.
- [scratch exp-g, run2/exp-g.out] Event that ended 167 h 30 min ago, member with a going RSVP, scratch copy of can_post_org_channel: session UTC -> may post t (30 minutes left); session Pacific/Auckland (clocks went forward Sept 27) -> f (window read as over 30 minutes ago). chat_repair_club in the Auckland session makes 0 event rooms for that event, in a UTC session 1. With `alter function ... set timezone to 'UTC'` the function answers t in the Auckland session. Local PostgREST (v14.5) answered `Preference-Applied: timezone=America/Indiana/Indianapolis` to an anon rpc call, so any client can choose the session zone. US clocks go back Nov 1: an event that ends Oct 28 23:00 UTC closes Nov 4 23:00 UTC for the routes and Nov 5 00:00 UTC for a request sent with Prefer: timezone=America/New_York. One hour, members only -> LOW (finding N1).

### N1 (low) The 7-day window is computed in the session time zone: the same room is open for one request and closed for another
- Where: migration :1068 (can_post_org_channel), :770 and :789 (chat_org_members_rooms), :958 and :984 (chat_repair_club); scripts/sql/chat-v2-after-deploy.sql:61, :88.
- Evidence: exp-g above; the read-only query of [tz].
- Change that keeps every contract sentence (`interval '7 days'` stays): pin the zone on the three functions that compute the window, `set timezone to 'UTC'` next to `set search_path to ''` (:1050, :742, :930), and in POST-CHECK e (:1299, :1300, :1303) expect `array['search_path=""', 'TimeZone=UTC']` for those three (the check compares proconfig as a whole array; verified form: {"search_path=\"\"",TimeZone=UTC}). The after-deploy script: `set local timezone = 'UTC'` cannot be used in one SELECT; write `e.ends_at + interval '168 hours'` there or say in its header that it is run in a UTC session.
- [scratch exp-e, exp-f re-run, run2/exp-e.out, run2/exp-f.out] Same answers as the earlier sitting: with DELETEs on channel_members failing, RSVP -> no, admin -> member and room -> private succeed with one WARNING each and leave 5 rows the repair does not remove; with writes to channels failing an event INSERT and a title UPDATE succeed, the repair later makes the room with the current title, and a title change swallowed LATER leaves event "Formal 3" with room "Formal 2" after the repair. Scratch schema rv absent afterwards (count 0).
- [local db, read-only] The PRE-FLIGHT facts on the local database as it is now: media in club rooms 0, org_subchannel 0, names board/lounge/officers 0, allow-list rows 0, private club channels sae/general + sae/exec, both md5 as in the header, 7 events in their window, 3 members below admin. Nothing drifted since the builder's rehearsal.
- [restated function] can_view_org_channel in the file = pg_get_functiondef of the live one + the 4 lines of the new arm (diff, run2/new_can_view.txt); the ROLLBACK copy has md5 269c1185295552f74930f1acffd7c170.

### N2 (low) An event room's name can drift from the event's title and nothing puts it back or lists it
- Where: migration :889-893 (the rename is one UPDATE inside the swallowing block), :951-960 (chat_repair_club step 2 only creates a MISSING room); scripts/sql/chat-v2-after-deploy.sql:55-63 (event_room lists missing rooms only).
- Evidence: exp-f (event "Formal 3", room "Formal 2" after the repair). The likelier way in: inside the apply window the old PATCH route renames ANY channel (asis 8.4), an event room included.
- Contract 3.4 says the repair "repairs what a failed trigger missed"; with its four steps it cannot repair a rename. Not a breach of the four steps, a gap in the sentence.
- Change (after-deploy script, read-only): one more list
    event_room_name as (
      select 'event_room_name'::text, o.id, o.handle, c.name, c.id, e.id, null::uuid,
             'title is ' || left(e.title, 80)
        from public.channels c
        join public.events e on e.id = c.event_id
        join public.orgs o on o.id = c.org_id
       where c.kind = 'event' and c.name is distinct from left(e.title, 80)
    )
  plus `union all select * from event_room_name` in findings; its fix column must not be the repair call (the fix is `update public.channels set name = left(e.title, 80)`, a write that needs a yes).

### N3 (low) Section E of the check script breaks INSERTs on channel_members only
- Where: scripts/sql/chat-v2-rooms-check.sql:907-916 (the break trigger is `before insert on public.channel_members`), cases E1-E8 (:918-981).
- Evidence: exp-e and exp-f ran what is missing and the migration behaves (the statements succeed, one WARNING each). The script does not prove it: no case has a DELETE inside a trigger fail (chat_rsvps_room :858, chat_org_members_rooms :793, chat_channels_subscribe :725) and no case has chat_events_room itself fail (:883, :890).
- Change: make the break trigger `before insert or delete on public.channel_members`, add a second one `before insert or update on public.channels` for the event cases, and add cases expecting 'ok 1': RSVP going -> no, admin -> member, a room turned private, an event INSERT, a title UPDATE. The grep rule in the header ("WARNING ... deliberate failure") stays true.
- [cross-check] B0's src/lib/chat/room-state.ts:30 computes the window as 7 * 24 * 60 * 60 * 1000 ms (absolute), which is what the database answers in a UTC session; the equality case (now = ends_at + 7 days) is "closed" on both sides. So N1 is the only place where the route and the policy can disagree.
- [other files] The two repo migrations production has not applied (20260922150000 billing, 20260924120000 push) name none of the objects this file changes (grep): applying A first does not make them refuse later. No function returns or takes the row type of channels / messages, no view depends on them, no function outside the five chat ones reads channel_members except is_channel_member and org_members_drop_club_access (catalog): ADD COLUMN breaks nothing at run time. All three SQL files are plain ASCII (the jq --rawfile recipe cannot trip on a byte).

## Verdict of the third sitting (lens: SQL correctness)

No high, no medium. Read again line by line against contract 3.0-3.9: statement order, the 9 CHECKs, both partial unique indexes, the six backfill steps on the local seed (4 x 1, 5, 5, 0, 0, 13) and on production's shape (4 x 1, 4, 4, 0, 0, 11), the five trigger bodies against the 3.4 table, chat_repair_club (four steps, insert-only), every ON CONFLICT, every identifier against the catalog, the restated can_view_org_channel (live body + one arm), can_post_org_channel against its table, the three policy texts. All as the contract says.
Reported this time (none of them is in the 33 findings of the four other lenses): N1, N2, N3, all low.
F1, F2, F3 and F5 of the earlier sitting are NOT reported again: the other lenses already hold them (stale rows, a renamed core room, private general -> public Lounge, the grant wording). F4 of the earlier sitting = N3.
One contract sentence that the four steps cannot keep: 3.4 "chat_repair_club repairs what a failed trigger missed". It repairs what is missing; it cannot repair a swallowed delete (other lenses) or a swallowed rename (N2).
The migration was NOT run, no rehearsal of it was run, no file but this one was written; every experiment ran on schema rv inside begin .. rollback (rv absent afterwards).
