# B1a review — SECURITY lens (read-only reviewer) — running log

Scratch: /private/tmp/claude-501/-Users-franciscocazares-vibe/9437fc3a-542d-49df-b9d8-857820065098/scratchpad/wave1/review-security
Rule: no file changed but this one; the migration is never run; experiments only on scratch objects inside begin ... rollback.

- [start] Read contract 0-3.10 and B1a-notes.md. Reading the migration next.
- [read] Migration read end to end (1516 lines); asis 1-5 read. Contract 12.1/12.2 = the two answers in the relayed user request (RSVP'd testers: accept; blocks in club rooms: nobody sees the other's messages).
- [next] Local DB state, then scratch copies of the tables + policies for the bypass experiments.
- [resume] Session restarted; re-read contract 0-3.10, 11, 12 and the migration lines 1-1516. Going to the local DB state and scratch experiments now.
- [plan] Harness = one psql file per run: begin; scratch schema zsec (base-1 tables + grants + RLS, base-2 today's helpers and policies, base-3-regen = migration lines 482-499, 600-619, 638-1131 with public. -> zsec.); fixtures; attacks as role authenticated with claims; rollback. No public table is referenced, so no lock on the real ones.
- [candidates from reading, to be proven or dropped]
  C1 chat_rsvps_room fires on UPDATE OF status only; rsvps_update_own lets a student change event_id on their own row (table-level UPDATE grant) -> stale event-room row survives with no RSVP.
  C2 channel_members_delete_own_pending's NOT EXISTS reads channels under the caller's RLS -> a row on a club room the caller cannot see is deletable.
  C3 Officers room: can_view_org_channel falls to the allow-list arm -> a demoted officer with a planted allow-list row keeps the Officers room.
  C4 accepted_at can still be nulled on a club-room row (column grant + channel_members_update_own).
  C5 12.2 (blocks): SELECT policy untouched, a direct read still returns a blocked person's club-room messages (contract defers to wave 2; user said "you shouldn't be able to see their messages still").
- [harness] scratch/review-security: base-1..4 + run.sh (begin; schema zsec; ...; rollback). Real grants read: authenticated may UPDATE rsvps.event_id / user_id / status (table-level), channel_members only the 7 setting columns, org_channel_members everything.
- [t1 writes, 30 attempts, t1-writes.out] ALL HOLD. Refused (42501): member and mod top-level on Board; kind poll / event_card / null; card_event_id on text; removed_at, removed_by, removed_reason each alone; media_url alone, media_kind alone; root missing / in another club's Board / a Lounge message / a reply / a removed post / own id; a root given in Lounge or event room; closed event room (member, officer, back-dated created_at); open event room without RSVP; Officers as member and mod; someone else as author; outsider with RSVP. Refused (permission denied): UPDATE and upsert on messages. Accepted as intended: member reply, RSVP holder in open event room, officer in open event room without RSVP. Noted, not a finding: a shared-post attachment (attachment_kind/attachment_id) is still accepted in a club room (contract only bans media_url/media_kind).
- [t2 reads + rpc, t2-reads.out] ALL HOLD. Member without RSVP, mod without RSVP: event rooms and Officers invisible (0 messages, 0 roster, can_view f). Outsider holding a going RSVP: nothing. After leaving through PostgREST: 0 rows left, RSVP kept, nothing visible; RSVP flipped / re-made as a non-member writes no row. After a removal: rows and RSVPs gone. can_view / can_post asked about someone else as authenticated: f; as anon: f; missing room, null room, null uid: f (never null). chat_repair_club as anon and as authenticated: "not allowed" (42501), also with a null argument. Trigger functions through a direct call: "trigger functions can only be called as triggers".

## FINDING F1 (medium) — an RSVP can be MOVED to another event without firing chat_rsvps_room; the old event-room row stays for good
- Where: migration :912-914 (create trigger chat_rsvps_room ... after insert or update of status or delete) and :829-860 (the function only looks at one row, old OR new).
- Fact (real DB): has_column_privilege('authenticated','public.rsvps','event_id','UPDATE') = true; rsvps_update_own USING/WITH CHECK only pin user_id.
- Proof (scratch, t3-candidates.out): mem2 inserts going on e1 (row on e1 room) -> `update rsvps set event_id = e3 where ...` (UPDATE 1, trigger silent) -> mem2 still holds the e1 row, reads "secret of Open event", inserts a message in e1, holds NO RSVP to e1. Setting the moved RSVP to 'no' and running chat_repair_club leave the e1 row in place.
- Reach: club members only (the membership arm still gates), so nobody outside the club gets in; but a member sits in an event chat they are not Going/Maybe to, invisible in the RSVP list, and nothing ever removes the row.
- [t4 own row / hidden room / allow-list, t4-ownrow.out]
  * Own club-room row: direct DELETE = 0 rows; accepted_at = null is ACCEPTED (UPDATE 4, column grant); DELETE after that = 0 rows (policy holds). Other people's rows: 0. role / channel_id update, INSERT: permission denied. chat_repair_club does not give accepted_at back (on conflict do nothing).
  * C2 DROPPED: a row on a room the caller cannot see is invisible to them (channel_members_select_member), so UPDATE 0 / DELETE 0. The NOT EXISTS under RLS cannot be reached.
  * C3 CONFIRMED (contract gap): Officers is only "private"; can_view_org_channel falls through to the allow-list arm. An owner inserted allow-list rows on Officers through PostgREST for a plain member and for themself: the member read the Officers message and can_post = t; after the owner was demoted to member they still read and post in Officers. The event arm ignores the allow-list (mem2 on e3's allow-list: can_view f).
- [routes that write channel_members rows] subscribe-public filters is_private = false (event/officers excluded by the CHECKs); threads/[id]/members POST refuses anything but type group; ensureMember writes nothing. So the triggers are the only writers of event-room rows.
- [seed] guarded: URL and keys only from `supabase status -o env`, refuses unless host is 127.0.0.1 / localhost.
- [check script] "LOCAL ONLY" is a comment; nothing in the file refuses another database. It inserts auth.users rows, creates a function in public and a trigger on channel_members (section E) before its rollback.
- [after-deploy] lists only MISSING things. A row that should NOT exist (event-room row without going/maybe and not an officer; a row held by a non-member) is never listed, and chat_repair_club deletes nothing.
- [t5 fix for F1 proven on scratch, t5-f1-fix.out] trigger `after insert or update of status, event_id, user_id or delete` + one block at the top of chat_rsvps_room (on UPDATE with a changed event_id or user_id: delete the row of OLD's event room unless OLD.user is owner/admin). Result: moved RSVP -> e1 row gone, e3 row present; an officer keeps both; the route's upsert (going -> no -> maybe, event_id and user_id in the SET list) still adds and removes the row.
- [t6 privacy, t6-privacy.out]
  * P1: a plain member reads 14 channel_members rows, 12 about other people, settings columns included (hid the Board, muted it, last_read_at = "has not read"). Known (contract 0: the settings-columns fix is not in v1) but the backfill is what creates these rows for everyone.
  * P2: an attendee sees 1 RSVP (their own) and 5 roster rows on the event room: the roster IS the going/maybe list for the people inside (designed, 12.1 / the Going line).
  * P3: after mem blocks mem2, mem still reads mem2's Lounge message with a direct read (SELECT policy untouched; 12.2 is route-level, a later wave).
  * C3 fix proven: one more arm `WHEN c.kind = 'officers' THEN COALESCE(org_member_role IN ('owner','admin'), false)` -> member on the allow-list f, demoted owner f, admin t.
- [t7 after-deploy, t7-afterdeploy.out] In the F1 state plus one row held by a non-member, the script as written lists only the MISSING e3 row ("1 findings"). The two rows that should not exist are not listed. Proposed listing `event_room_extra` finds both.

## FINDINGS (final)

### F1 — HIGH (a rule on the attack list is bypassed; reach: club members only)
supabase/migrations/20261001100000_chat_v2_rooms.sql:913 (trigger) and :816-865 (function).
An RSVP row can be moved to another event (`update rsvps set event_id = ...`, allowed by the table-level UPDATE grant and rsvps_update_own) without firing chat_rsvps_room (UPDATE OF status only). The old event-room row stays: the member reads and writes that room with no RSVP to it; a later 'no' and chat_repair_club do not remove it.
Change (proven on scratch, t5): (1) trigger `after insert or update of status, event_id, user_id or delete on public.rsvps`; (2) at the top of the function body, before `if tg_op = 'DELETE'`:
    if tg_op = 'UPDATE' and (new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id) then
      delete from public.channel_members cm using public.channels c
       where c.id = cm.channel_id and c.kind = 'event' and c.event_id = old.event_id and cm.user_id = old.user_id
         and not exists (select 1 from public.org_members m where m.org_id = c.org_id and m.user_id = old.user_id and m.role in ('owner','admin'));
    end if;
(3) contract 3.4 table row chat_rsvps_room: "AFTER INSERT OR UPDATE OF status, event_id, user_id OR DELETE" (the orchestrator's call: the contract names the narrower event list); (4) a case in chat-v2-rooms-check.sql after C16: move the RSVP to another event as the member -> old room row gone, new room row present.

### F2 — LOW: scripts/sql/chat-v2-after-deploy.sql:78-101 lists only missing things
The four AFTER triggers swallow errors (12.16); the cost named in 3.4 is a member staying in an event chat. Nothing lists such a row, and chat_repair_club deletes nothing. Add a fifth CTE `event_room_extra` (SQL in the structured answer), with detail text instead of the repair call as its fix.

### F3 — LOW (consequence of decision 27, "Officers stays owner + admin + the allow-list")
migration :791-803 and :1022-1025. A demoted officer who holds an allow-list row on Officers (any owner/admin can insert one for anyone, themself included, through PostgREST) keeps reading and posting there; nothing removes it on demotion. If that is not wanted: in the demotion branch also `delete from public.org_channel_members ocm using public.channels c where c.id = ocm.channel_id and c.org_id = new.org_id and c.kind = 'officers' and ocm.user_id = new.user_id;` — Franky's call, it changes 3.4's wording.

### F4 — LOW: accepted_at can still be nulled on a club-room row
migration :1126-1131 holds (DELETE 0 rows) but `update channel_members set accepted_at = null` is accepted on the member's own club-room rows (UPDATE 4) and chat_repair_club (:962-972, on conflict do nothing) never restores it. The old inbox reads accepted_at null as a "request" (threads/route.ts:625) and decline then answers 500. Self-inflicted and undone by accept/send; note for B4, no DB change needed.

### F5 — LOW: scripts/sql/chat-v2-rooms-check.sql:41-51 has no guard behind "LOCAL ONLY"
Add to the first DO block: `if inet_server_addr() is not null then raise exception 'chat-check: local only. Run it through docker exec (unix socket), never against a remote database'; end if;` (docker exec reads null, verified).

### F6 — LOW, for the record (outside B1a): what the backfill exposes through untouched SELECT policies
(a) every member now reads every co-member's settings columns on club rooms (hidden_at, muted_until, last_read_at = "seen by"); contract 0 lists the fix as not in v1. (b) a block changes nothing for a direct read of a club room (12.2 is route-level, later wave); if "you shouldn't be able to see their messages" has to hold against PostgREST too, messages_select_org_member needs a block arm with the Board exception.

## HELD (no finding): Board rule (member, mod), kind, card_event_id, removed_* x3, media x2, roots x8, closed event room x3, event room without RSVP, Officers as member/mod, author forgery, outsider, UPDATE/upsert on messages, own-row delete, other people's rows, INSERT/role/channel_id on channel_members, reads (member w/o RSVP, mod, outsider with RSVP, after leave, after removal, non-member re-RSVP), asking about someone else, anon, chat_repair_club and trigger functions through rpc, search_path '' + qualified names on all 7 new functions, restated GRANTs (:996, :1033, :1081), standing-rule query (:1355-1360 = asis 4.6), seed guard.
- [end] Structured answer returned: F1 high, F2-F6 low. No file changed but this one; the migration was never run; every experiment ran on schema zsec inside begin .. rollback (zsec absent afterwards: 0, channels.kind columns in public: 0).
