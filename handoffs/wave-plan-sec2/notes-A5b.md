# Notes: A5b club chat + club posts (security wave 2)

Builder log, appended as I go (2026-09-27).

## Scope (waveA-build.md row A5b)
- channel-access.ts ensureMember: 403 on an unreadable channel (before DM path)
- me/messages-upload-url + users/search: use ensureMember; search fails closed on blocks-read error (loadHiddenUsers)
- orgs/[slug]/channels/** (hidden-club 404), orgs/[slug]/posts/** (restriction, school-verified, word filter, hidden-club 404)
- orgs/[slug]/route.ts PATCH: word filter/length/link checks; revoke orgs text-column UPDATE grants
- Migration 20260928150000_club_chat_posts_rules.sql: channel_members_select_member + can_read_channel_roster; posts_update_own club-post officer clause; orgs column UPDATE revoke
- May import existing src/lib/orgs exports only (A5a owns src/lib/orgs/**)

## LIVE STATE (prod, read-only MCP, 2026-09-27)
- last migration 20260927142000; can_read_channel_roster does not exist.
- channel_members policies: select_member USING `is_channel_member(channel_id)` (only SELECT policy); update_own; delete_own_pending. No triggers.
- posts_update_own USING `(auth.uid() = user_id)` CHECK `((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now())`; the only UPDATE policy on posts.
- orgs column UPDATE for authenticated: backdrop_preset, banner_url, description, links, logo_url, name, philanthropy, tags, updated_at (no table-level UPDATE; anon none).
- channels: authenticated has table INSERT (policy channels_insert_authenticated: owner/admin + consent + can_publish_now). Not touched here; note.
- helpers: is_channel_member(cid) SECDEF search_path=public; can_view_org_channel(cid,uid) SECDEF (false for anon / other uid / org_id null / non-member; public ch true; private needs owner/admin or org_channel_members); org_member_role(oid,uid) caller-only; can_publish_now() = consent+age+school_verified+not restricted.
- counts: club posts 0 (0 by a non-officer author); org-channel channel_members 2 (stale 0, private-without-access 0); DM/group channel_members 23; orgs 5.
- posts triggers: bump_org_activity_on_post, posts_check_media_refs, posts_stamp_campus, posts_stamp_edited. orgs triggers: orgs_check_asset_refs, orgs_sync_join_policy.

## Callers checked (grep 2026-09-27)
- orgs writes: only service role (orgs/[slug]/route.ts:634, admin verify + hide). Browser client (src/lib/supabase/browser.ts) importers are auth pages, ProfileHandleSwitch, suspended-actions: none touch orgs/posts/channel_members. public/html: no PostgREST calls. => orgs column UPDATE revoke is safe.
- posts UPDATE with cookie client: only posts/[id]/route.ts:630 PATCH (A2/B2-owned); it already refuses a club post unless loadOrgRole says owner/admin (service read) => new posts_update_own clause can't 500 it (only a role change mid-request could).
- channel_members cookie readers (me/threads*, me/otto, block, badge, group-photo-upload-url...): all own-row or DM/group; for a CURRENT member of a public org channel can_view_org_channel is true, so nothing changes; only ex-members' stale rows and rows on private channels without access become invisible (0 of each live).
- channels INSERT: every insert is service role (orgs/route.ts:865, channels/route.ts:172, me/threads:268/340). authenticated still holds table INSERT + channels_insert_authenticated (no word filter). FOLLOW-UP, not mine.
- messages route doesn't validate the channel id is a uuid (garbage -> 500 today via channel_members read error). ensureMember will answer 403 for a non-uuid.

## Decisions
- Pure gate module: new `src/lib/club-routes/gate.ts` (+ test). A5a owns src/lib/orgs/** and is writing hidden-gate.ts; I may only import EXISTING orgs exports, so my 404/403 decision lives in a new neutral dir. FOLLOW-UP: fold into A5a's hidden-gate once both land.
- Migration file order: after deploy per waveA-build, but every change is tolerated by today's code (safe either side).

## Migration 20260928150000_club_chat_posts_rules.sql (written, applied locally)
- Sections: can_read_channel_roster helper; channel_members_select_member AND helper; posts_update_own + owner/admin clause (USING + CHECK); revoke 9 orgs column UPDATE grants.
- PRE-FLIGHT: exact policy texts, no other permissive policy ORing around, posts.org_id/user_id not updatable, orgs grant set exact, RLS on, helper name free.
- POST-CHECK part 1 catalog; part 2 behaviour as `authenticated` in sentinel-rollback blocks (orgs.name UPDATE -> 42501; helper false for stranger/missing; probe stale row invisible + probe club post by non-officer not editable; DM roster count unchanged).
- Local apply: clean. Proof the probes bite: re-ran part 2 against each reverted rule inside a rolled-back txn -> roster "ex-member still reads 2 rows", posts "non-officer author could still edit", orgs "could still UPDATE orgs.name". All three caught.
- Header ROLLBACK run locally: restored exact old texts + grant, dropped helper; re-apply passed PRE-FLIGHT again. Left APPLIED.

## Local role probes (rolled-back txns; scripts in session scratchpad probe-roster.sql / probe-posts.sql)
- R1 current admin (emery) reads #general roster: 1 row; own rows joined to channels: 2. PASS (unchanged)
- R2 emery's org_members row deleted (no A5a trigger locally, so stale rows stay): roster rows 0, channels 0. PASS (#14 closed)
- R3 blake joins hidden club + subscribes: roster 2; after leaving: 0. PASS
- R4 DM roster for blake: 2 of 2; DM channel visible. PASS (no recursion)
- R5 private channel, member without allow-list: 0; after org_channel_members insert: 1. PASS
- R6 anon: 42501 (anon has no SELECT grant on channel_members at all). PASS
- P1 owner edits own club post 1; P2 admin edits own club post 1; P3 admin edits owner's club post 0; P4 author demoted to mod 0; P5 removed author 0; P5b removed author still DELETEs own club post 1 (unchanged on purpose, B2); P6 personal post edit 1. PASS
- O1 owner direct `update orgs set name` / `links` -> 42501 both; O2 service_role update 1. PASS

## Code (in progress)
- NEW src/lib/club-routes/gate.ts (+ gate.test.ts, 9 tests pass): clubRouteGate (404 hidden-to-strangers / 403 / 500) + hasBlockedNewLinkLabel (word filter on NEW link labels only).
- channel-access.ts ensureMember: non-uuid -> 403; channels read error -> 500 (was ignored); unreadable channel -> 403 BEFORE the DM branch. Signature + return shape unchanged (A2 please review the 403 path: callers messages GET/POST + media proxy already map !ok to 403/404).
- me/messages-upload-url: ensureMember instead of a bare channel_members row; requireTermsAccepted -> requireCanPublish (the send path's gate; Terms refusal body unchanged). Non-uuid channelId now 403 (was an R2 key built from any string).
- users/search: channel scope via ensureMember (500 on its error, else quiet []), roster read error -> 500; blocks via loadHiddenUsers, FAILS CLOSED (500) instead of swallowing.
- orgs/[slug]/posts POST: requireTermsAccepted -> requireCanPublish; org/role read errors surfaced; clubRouteGate (hidden stranger 404; non-officer 403 unchanged copy; officers of a hidden club still get 409 org_hidden); checkText(content) -> 422 content_blocked field "content" after the length check.
- orgs/[slug] PATCH: clubRouteGate (owner_id branch kept; hidden stranger 404; role read error 500 instead of silent 403); NEW word filter on link labels (only labels not already stored) and philanthropy (checkChangedText). name/description filter + lengths were already there. DELETE: requireNotRestricted (orgs_delete has NOT is_restricted_now(); route is service-role) + hidden stranger 404.
- NEW src/lib/club-routes/officer-guard.ts (server-only): loadClubOfficer(slug, viewer, {channelId?, allowed?}) -> service reads + clubRouteGate + optional channel-belongs-to-club (non-uuid -> 404). Same error strings as the old requireStaff copies.
- channels POST: requireCanPublish (channels_insert_authenticated has can_publish_now; route is service-role), checkText on name + topic, loadClubOfficer (was cookie org read + ignored role error).
- channels/[channelId] PATCH/DELETE, reorder, members POST, members/[userId] DELETE: requireNotRestricted + loadClubOfficer; PATCH name/topic checkChangedText vs stored. members GET: loadClubOfficer only (read).
- NOT changed: channels GET (already 404 for hidden strangers), subscribe-public (member self-action; cookie org read already 404s hidden strangers).
- ensureMember query probes (probe-ensure.sql, rolled back): E1 pending DM invitee still reads the channel row (implicit accept intact); E2 owner with no subscription row reads the club channel (org branch); E3 stranger 0; E4 ex-member with stale row: channel 0 AND own stale row 0. PASS.
- NO HTTP route calls: the dev server needs a signed-in session and a workflow subagent must not sign in (even with seed passwords). Route behaviour is covered by tsc + the DB-level probes of the exact queries; the orchestrator's 375px browser walk should hit: club chat send/upload, @mention search in a club chat, club post create (and a blocked word), club settings save (links/philanthropy).

## Final checks (2026-09-27)
- `npx tsc --noEmit -p .`: clean (whole repo, after the other batches settled).
- `npm test`: 1129 tests, 1128 pass, 1 fail = known src/lib/otto/parse-reminder.test.ts. gate.test.ts 9/9.
- eslint on every file I touched: clean.
- Re-ran POST-CHECK part 2 + all three probe scripts AFTER A5a's 100000 (triggers org_members_drop_club_access, org_members_clear_removal_on_join) landed locally: all pass. A5a's migration header says it does not touch my three objects.
- Migration left APPLIED locally (no schema_migrations row).

## Requests / follow-ups for others
- VERSION CLASH: plan.md gives B2 the same 20260928150000; waveA-build gives it to A5b. B2 needs a new number. If B2 alters posts_update_own it must restate my org clause word for word.
- A2: review ensureMember's new early 403 (non-uuid, unreadable channel) and 500 (channels read error) on the messages GET/POST + media proxy.
- Follow-up: revoke INSERT on public.channels from authenticated (every app insert is service-role; the direct path skips the word filter on channel names/topics).
- Follow-up: fold src/lib/club-routes/gate.ts into A5a's src/lib/orgs hidden gate once both land (same rule, two copies).
- Follow-up: subscribe-public ignores read errors (org read error -> 404, member read error -> 403); harmless, not changed.
- Not done: word filter on org link URLs (only labels); the filter isn't built for URLs.
