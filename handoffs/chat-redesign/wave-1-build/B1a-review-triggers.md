# B1a review — lens: TRIGGERS AND CASCADES (read-only reviewer)

Scratch: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1/review-triggers

## Running log

- [start] Read contract 0-3.10 and wave-0-decisions, B1a-notes. Reading the migration next.
- [read] Migration sections 1-4 read (lines 476-996). Catalog read: triggers, FKs, constraints, grants, policies on rsvps/events/org_members/channels.
- [fact] authenticated holds UPDATE on every column of public.rsvps (event_id, user_id, status, id, created_at); policy rsvps_update_own lets the owner of the row change event_id. events: authenticated has no INSERT/UPDATE (routes use service role).
- [fact] channels has NO unique on (org_id, name) and no name CHECK; channel_members unique (channel_id, user_id); a table channel_member_mutes also hangs off channels (cascade).
- [lead 1] chat_rsvps_room is "UPDATE OF status": a PATCH that moves an RSVP to another event (event_id only) does not fire it; with status in the SET list it fires for NEW only and the row on the OLD event's room stays. To test on scratch copies.
- [lead 2] chat_events_room is "INSERT OR UPDATE OF title": events.org_id changes are not seen. Check whether any route changes events.org_id.
- [harness] Scratch schema rvt (copies of the 9 tables with the real FKs' ON DELETE actions, the 4 existing org_members triggers, migration steps 1+3, and lines 636-996 of the migration with public. -> rvt.), everything inside begin .. rollback. Files: review-triggers/prelude.sql, section4_rvt.sql, fixtures.sql, run.sh, t*.sql.
- [T1 CONFIRMED lead 1] member M going on Event One (row on its room). `update rvt.rsvps set event_id = <Event Two>` (status not in SET): trigger does not fire; M holds an RSVP for Event Two and a row on Event One's room only. With status in the SET list M ends with rows on BOTH rooms and one RSVP. authenticated may issue that PATCH (UPDATE grant on rsvps.event_id + rsvps_update_own).
- [T1 ok] outsider going/no/delete: no row, no error. Admin going/no/delete keeps the row.
- [resume] Picked the review up again: harness re-checked (section4_rvt.sql is byte-equal to migration lines 636-996 with public. -> rvt.). Local db still un-migrated (channels.kind absent). Re-running T2 and T3.
- [T2 ok] title update renames (120 chars -> 80); ends_at update fires nothing; event delete with 1 RSVP + root/quote messages: rsvps, room, rows, messages gone, no WARNING, no error (chat_rsvps_room finds no event and returns). Personal event: no room. An event inserted already 10 days past gets a room + officers' rows (contract 3.4 has no window on INSERT; chat_repair_club would not have made it). Two events with one title = two rooms with one name. An event titled "general" stays kind event.
- [T3 ok] promote -> rows on all open event rooms; demote -> keeps the RSVP'd room, loses the other; admin -> mod loses event rooms; leave -> all rows gone, RSVP kept; non-member RSVP flip writes no row; re-join -> public rooms + RSVP'd event room; removal -> rows + unended RSVPs gone, no WARNING. Trigger name order on org_members: chat_org_members_rooms, clear_removal_on_join, (drop_club_access), imply_follow, (unfollow_on_leave): no dependency between them.
- [T3 note] a demoted admin keeps the channel_members row they had on Officers (the trigger only handles event rooms; contract 3.4 says the same). Inert: channels RLS (can_view_org_channel) hides the room, /api/me/threads joins channels!inner with the cookie client. Not a finding.
- [fact] events.org_id cannot change through the app (PATCH answers org_cannot_change, authenticated has no UPDATE on events) -> lead 2 is service-role only, low.
- [fact] rsvp route: upsert on the cookie client (status in the SET list -> trigger fires). 'no' only through direct PostgREST.
- [fact] scripts/sql/chat-v2-after-deploy.sql lists MISSING rows only; chat_repair_club deletes nothing. So a swallowed DELETE (RSVP -> no, demotion) or the moved RSVP of T1 is never listed and never repaired.
- [T4 ok] old-code inserts: general/announcements become room when the club has its Lounge/Board; a multi-row insert (general, general, announcements) gives lounge, room, board (the 2nd row sees the 1st). Room public -> private deletes every row (officers' too), private -> public gives everyone a row. Lounge private / Officers public / event public: refused by the CHECKs. dm/group with a kind sent: kind forced to null.
- [T4 note] chat_channels_fill_kind turns a channel sent as PRIVATE and named general / announcements into the PUBLIC Lounge / Board (migration :652-663). Contract 3.4 says "lounge / name lounge / public", so it is as written; the backfill (3.2.2, 3.2.3) only promotes PUBLIC ones. Low.
- [T4 note] an UPDATE that changes kind (room -> officers) together with is_private keeps every member's row (trigger looks at new.kind = 'room' only). No route does it; service role only. Low.
- [T5 ok] delete a plain member with RSVP + messages; delete an admin who wrote a Board post with a reply; delete the owner who created both events; delete the club with a removed member + RSVPs: no WARNING, no error, nothing left behind.
- [T6] error injection (a BEFORE DELETE trigger on the scratch channel_members that raises): RSVP -> no, admin -> member and room -> private all succeed with one WARNING each and the rows STAY. chat_repair_club afterwards deletes nothing (stale: 1 RSVP row, 2 ex-officer event rows, 4 rows on the now-private room) and the after-deploy query finds 0. With channels INSERT broken an event is still created (no room); the repair later makes the room + rows. Wrap present on the 4 AFTER functions, absent on chat_channels_fill_kind (read :638-668, :674-732, :738-808, :816-865, :872-898).
- [recursion] none: the only trigger-inside-trigger chains are events -> channels (fill_kind, subscribe) -> channel_members, and org_members delete -> rsvps delete -> chat_rsvps_room -> channel_members. channel_members has no trigger (catalog read). RI triggers fire before the chat triggers (name order: "RI_" < "chat_").

## Findings (written as they are confirmed)

### F1 (medium) A moved RSVP leaves the old event-room row behind; without status in the SET list the trigger does not fire at all
- Where: supabase/migrations/20261001100000_chat_v2_rooms.sql:912-914 (trigger: `after insert or update of status or delete`) and :829-833 (function reads NEW only on UPDATE).
- Why it is reachable: authenticated holds UPDATE on rsvps.event_id (information_schema.column_privileges) and rsvps_update_own only asks auth.uid() = user_id + the campus/visibility checks on the NEW event. `PATCH /rest/v1/rsvps?id=eq.<id>` with `{"event_id": "<other event>"}` is a legal client write.
- Evidence (scratch t1.sql, output t1.out): M going on Event One (row on its room). `update rsvps set event_id = <Event Two>`: RSVP now says Event Two / going, M's only event row is still "Event One". With status in the SET list (`set event_id = .., status = 'maybe'`): M holds rows on BOTH rooms with ONE RSVP. The event arm of can_view_org_channel (:1016-1019) reads that row as access, chat_repair_club deletes nothing, and the after-deploy query only lists missing rows.
- Impact: a club member reads and writes an event chat they hold no RSVP for, and appears in its roster. Members only, and they could RSVP again, so no outsider gains anything; it is wrong data that nothing repairs.
- Change (verified on the scratch copy, t7.sql / t7.out: row follows the RSVP, officers keep theirs, event delete stays clean): fire on the key columns too and treat OLD as a removal.
  trigger: `after insert or update of status, event_id, user_id or delete on public.rsvps`
  function: before the NEW handling, `if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (old.event_id is distinct from new.event_id or old.user_id is distinct from new.user_id)) then <find the room of old.event_id; delete old.user_id's row unless owner/admin>; if tg_op = 'DELETE' then return null; end if; end if;`
- CONTRACT NOTE: 3.4 names the trigger events as "AFTER INSERT OR UPDATE OF status OR DELETE". The fix widens that list, so it needs the orchestrator's yes; I did not find a fix that keeps the list (revoking UPDATE on event_id breaks the route's upsert, which puts event_id and user_id in its DO UPDATE SET).

### F2 (low) Nothing lists or repairs a row that should NOT be there
- Where: scripts/sql/chat-v2-after-deploy.sql:9-14 (header: "run this again whenever the database log shows chat-rooms: ... failed") and :41-94 (four arms, all "missing"); migration :919-991 (chat_repair_club only inserts).
- Evidence (scratch t6.sql / t6.out): with DELETE on channel_members broken, RSVP -> no, admin -> member and room -> private each succeed with one WARNING and keep their rows; chat_repair_club afterwards leaves 1 + 2 + 4 stale rows; the event_room_row arm finds 0. The ex-officer's two event rows are live access (event arm of can_view_org_channel).
- Contract 3.4 accepts the cost of a swallowed delete, so this is not a breach; but the header promises a check that cannot see this half of the failures.
- Change: add a fifth arm `extra_row` to the after-deploy query (verified on the scratch copy, t8.sql / t8.out: it lists the moved RSVP of F1 and the swallowed demotion): a channel_members row on a club room whose holder is not a member of the club, or on an event room whose holder is neither owner/admin nor holds a going/maybe RSVP. Its fix column is a DELETE of that one row (needs Franky's yes on production), not chat_repair_club. And change the header sentence to say which warnings the repair cannot fix (a failed delete).

### F3 (low, reasoned, NOT run: two sessions cannot share a scratch schema that is never committed) Two writes at the same moment can each miss the other's row
- Where: migration :753-775 (join reads channels), :702-707 and :714-719 (new/public room reads org_members), :844-855 (RSVP reads org_members).
- Reasoning: READ COMMITTED. T1 inserts org_members(M) and its trigger reads the club's rooms; T2 inserts a public room and its trigger reads the club's members. Neither sees the other's uncommitted row; both commit; M has no row on the new room. Same shape: join + RSVP by the same person (no event-room row), promotion + a new event (officer has no row, still has access by role), RSVP -> no + demotion (row stays).
- Nothing runs chat_repair_club after the apply except club creation, so a missed row stays until someone runs the after-deploy check.
- Change (wording, no lock: a lock inside the RSVP path would work against "a chat bug never blocks an RSVP"): in the migration comment above 4.6 and in the after-deploy header, say that concurrent writes can miss a row and that the check is run weekly (and after any chat-rooms warning), not only after the deploy.

### F4 (low) The PRE-FLIGHT does not check the trigger set the chains were traced against
- Where: migration :55 (LIVE STATE: "channels, rsvps, events: no trigger. org_members: 4 triggers.") and :353-361 (the only pg_trigger read: are the five NEW names free).
- Evidence: local catalog today: no user trigger on channels, channel_members, rsvps, events; four on org_members. asis section 11 (production) compares functions, policies, grants and columns, not triggers. channel_members, the table all four AFTER functions write to, is not named in LIVE STATE at all. "No recursion" holds only while that table has no trigger.
- Change: in PRE-FLIGHT part c add
  select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into bad from pg_trigger t
   where not t.tgisinternal
     and t.tgrelid in ('public.channels'::regclass, 'public.channel_members'::regclass, 'public.rsvps'::regclass, 'public.events'::regclass, 'public.org_members'::regclass)
     and t.tgname not in ('org_members_clear_removal_on_join', 'org_members_drop_club_access', 'org_members_imply_follow', 'org_members_unfollow_on_leave');
  if bad is not null then raise exception 'chat-rooms: a trigger this file was not written against: %', bad; end if;
  and add "channel_members: no trigger" to the LIVE STATE line.

### F5 (low) chat_channels_fill_kind opens a channel that was sent as private
- Where: migration :652-663.
- Evidence (scratch t4.sql / t4.out, T4b): old-code insert ('general', is_private true) into a club without a Lounge is stored as kind lounge, is_private false, with a row for every member. The backfill (:548-554) only promotes a PUBLIC general.
- Reach: tiny (a club with no Lounge exists only inside the apply window or after the old modal deleted one). Contract 3.4 reads "lounge / name lounge / public", so the file is as written; the question is which reading was meant.
- Change, if the orchestrator agrees with the backfill's reading: add `and new.is_private = false` to both conditions (:652 and :658) and drop the two `new.is_private := false;` lines; a private general / announcements then falls to `room` and stays private.

## Checked and found sound (no finding)
- Wrap present on the four AFTER functions, absent on chat_channels_fill_kind; warning text as the contract has it.
- No trigger raises when its parent is gone: event delete (RSVP cascade finds no event, returns), club delete, user delete (member, admin, owner/creator), removal (nested RSVP deletes): no WARNING, no error (t2, t5).
- No recursion; RI checks fire before the chat triggers; chat_org_members_rooms fires before the three org_members_* INSERT triggers and depends on none.
- Locks and cost: production is 5 clubs / 12 rooms / 13 events / 7 RSVPs; every trigger query is on an existing index (channels_org_id_idx, channels_event_id_key, rsvps_event_id_user_id_key, org_members_org_id_user_id_key, channel_members_channel_id_user_id_key). Nothing to change at this size.
- events.org_id and channels.kind / org_id changes are not watched by any trigger; no route and no client grant can make them (PATCH /api/events/[id] answers org_cannot_change; authenticated has no UPDATE on events or channels).
- App writers of channel_members for club rooms (membership.ts:232, subscribe-public:84, the seed :392 / :491) all upsert with ignoreDuplicates, so rows the triggers wrote first do not make them fail.

- [done] Review finished. 1 medium, 4 low. Nothing in the repo or the database was changed; scratch files are in review-triggers/ (t1-t8 .sql/.out).
