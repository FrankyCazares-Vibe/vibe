# Review A5b (club chat + club posts): does it actually close the findings? (bypass lens)

Reviewer log, appended as I go (2026-09-27). Read-only; DB probes in rolled-back txns only.

## Findings owned by A5b
- #14 (roster read by ex-member): channel_members_select_member + can_read_channel_roster; ensureMember 403; upload-url + search use ensureMember.
- #13 (edit half): posts_update_own requires current owner/admin for club posts.
- Low: orgs text-column UPDATE revoke + word filter in PATCH.
- Low: orgs/[slug]/posts gates (restriction, school-verified, word filter).
- Low: officer-only club routes 404 for hidden club (channels/**, posts, route.ts).

## Progress
- Local catalog matches the migration: roster policy = is_channel_member AND can_read_channel_roster; posts_update_own has the owner/admin clause on USING + CHECK; authenticated holds no orgs UPDATE (table or column); helper is STABLE SECDEF search_path '' with EXECUTE for anon/authenticated/service_role; no REVOKE EXECUTE anywhere.
- Other channel_members readers: only is_channel_member / can_view_org_channel (booleans about the caller) and A5a's trigger. No views, no realtime publication tables, no realtime policies (local and prod). App code has no realtime subscriptions. So PostgREST table read is the only roster path -> closed by the policy.
- Prod (read-only): authenticated holds table INSERT on channels (no UPDATE); posts org_id not insertable/updatable; orgs no INSERT.
- Attacker probes (rolled back; scratchpad rev-a5b-roster.sql / rev-a5b-posts.sql), emery_admin made an ex-member of test_invite_club with a re-inserted stale #general row:
  - roster read 0, all org-channel rows 0, channel row 0, messages 0, RPC can_read_channel_roster false; UPDATE own stale row with WHERE or RETURNING touches 0; can_view_org_channel for another uid false. Owner still reads the roster (2). anon: 42501 on the table, false on the RPC. PASS.
  - club post: admin edits own 1; admin edits owner's post 0; demoted to mod: content 0, tags 0, WHERE-less 0; org_id UPDATE 42501; direct club-post INSERT 42501 (org_id not insertable); removed: 0. PASS.
  - orgs as owner: UPDATE description/tags/hidden_at+verified/join_policy -> 42501; INSERT..ON CONFLICT -> 42501. PASS.
- Other roster paths checked: messages GET roster, users/search, threads list: cookie client (policy applies) behind ensureMember. Push: club channels skip the member push; @mention push in a club chat targets org_members (ex-members excluded). subscribe-public requires org membership. No service-role roster read reachable by an ex-member.
- Other posts writers: only posts/[id] PATCH (cookie, route checks loadOrgRole first) and SECDEF triggers that bump orgs.last_activity_at. orgs writers: service-role routes only. channels inserts: all service-role (orgs/route.ts:865, channels/route.ts:170, me/threads 298/370).
- tsc clean; gate.test.ts 9/9.
- Extra probe (rev-a5b-upd.sql): an ex-member can still blind-write their OWN stale row with a WHERE-less `update channel_members set typing_until = ...` (UPDATE 1): channel_members_update_own is only `auth.uid() = user_id`. No read, no leak; current members would just see a stale "typing"/read stamp. A5a's trigger + cleanup leave no stale rows, so Low. Optional: AND public.can_read_channel_roster(channel_id) on update_own USING.
- Apply-order check: the DB change alone also closes #14 through the OLD routes (old ensureMember falls to the DM branch, whose own-row read is now hidden -> 403). No other wave-A migration touches the three objects (A5a header says so; A2 greps clean). Prod POST-CHECK probe insert: posts NOT NULLs/CHECKs satisfied (null school_system passes the CHECK; null media passes post_media_ref_ok).

## Verdict: SHIP (no must-fix)
#14 closed at the policy (every roster path is cookie-client or membership-gated); #13 edit half closed for content/status/tags and every UPDATE shape; orgs text columns closed (42501 for every write shape, INSERT never granted). Helper is safe: STABLE SECDEF, search_path '', schema-qualified, EXECUTE granted, no REVOKE EXECUTE. No product call implemented backwards (owner/admin for post edits and channel management; mods get chat, not content).

## Should fix
1. channels INSERT is still granted to authenticated (channels_insert_authenticated). A current officer can POST /rest/v1/channels directly with any name/topic and skip the route's new word filter, the slug-shape rule and the uniqueness check. Every app insert is service-role (orgs/route.ts:865, channels/route.ts:170, me/threads 298/370), so `revoke insert on public.channels from authenticated` (+ PRE-FLIGHT/POST-CHECK has_table_privilege) fits in this file.
2. channel_members_update_own: add the roster helper (see above). Low.
3. can_read_channel_roster answers true for ANY existing DM/group uuid, member or not (RPC existence oracle; needs the uuid). Could return is_channel_member(cid) AND ... instead. Nit.
4. Link URLs aren't word-filtered (labels only). Builder noted.
5. Version numbers: B2 plan also says 20260928150000 and B4 plan says 20260928160000 (= A1). Orchestrator to renumber wave B.
6. Out of A5b's lane: a CURRENT owner/admin (and any author of a personal post) can still PATCH /rest/v1/posts content/tags directly and skip the word filter. General gap; flag for B4/B2.

## Resume re-check (2026-09-28)
- After the usage-limit pause: local catalog still reads as the migration says (roster policy, posts_update_own USING + CHECK, orgs.name UPDATE revoked, helper SECDEF with search_path ""); 0 stale org-channel roster rows left behind; every probe was rolled back. Verdict unchanged: SHIP.
