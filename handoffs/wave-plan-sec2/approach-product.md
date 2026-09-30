# Critique result: product (go-with-changes)

## Recommended approach

Wave A is the right wave, and if it's built carefully almost nothing changes on normal screens. Most rules already live in the routes; the database changes mostly stop the dev-tools path. The real product risk is silent regressions: a policy tightened under a cookie-client reader returns zero rows instead of an error. Full critique: /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-product.md.

A1 profile privacy.
- Visitor blanking is invisible. profile.html:677 already hides `.widget-empty` in viewer mode, so a hidden widget ends up looking the same as one never filled in, which is a privacy win.
- Blanking must skip relationship "self". The owner's page uses /api/me/profile-bootstrap and must stay untouched.
- Do NOT revoke users.bio. src/app/api/me/threads/route.ts:465 reads other members' bio with the cookie client, and public/html/messages.html:2014 shows it as the DM subtitle. Take the copy branch: "Hidden from your profile" for bio/skills/experience/working-on. Keep "only you see it" only for the résumé.
- Also drop bio from the og:description in src/app/profile/[handle]/page.tsx:71 when bio is hidden (A1 owns that file).
- Unverified viewers must get a clean résumé empty state, not a Download link that 404s.

A2 blocks.
- Keep the block check OUT of users_select_authenticated. DM, club chat, member and follower embeds don't use `!inner`, so names would turn to null inside existing threads. Comments use `!inner`, so they are fine.
- Add the SELECT rule on posts and comments. Recommended extra: hide a comment from everyone when its author and the post's author are a blocked pair. Old comments are today's gap, because the new WITH CHECK only stops new ones.
- Saved list (me/bookmarks:63) and the reposts tab (:145) already drop missing posts quietly.
- Give /posts/<id> a friendly "This post isn't available" message.
- When a group-chat add is refused, the copy must be neutral, because the adder is a third party.
- Follow-up: last_active_at is readable by a blocked person. Move api/stats/campus to a count RPC, then revoke SELECT on it.

A3 Vibe+ and counts.
- src/app/api/me/profile-views/route.ts (the free tiles) reads profile_views, including viewer ids, with the cookie client under profile_views_owner_select (lines 116/173-183).
- Convert it to the service role or a count RPC in the same batch. Otherwise every student's tiles read 0 silently, because RLS returns zero rows and not an error.
- #18 makes the savers sheet heading match the card count, which is an improvement.
- When the Vibe+ list is shorter than the total, show "People you've blocked or muted aren't listed."

A4 club events.
- The past-start guard must be a BEFORE INSERT trigger with the route's 5-minute grace (events/route.ts:498), not a CHECK: 12 of 13 live events are already past.
- Fix viewer_can_manage (events/route.ts:390) to be isOrgAdmin for club events, so a demoted creator isn't shown a manage button that then 403s.
- The campus list uses `creator:users!events_creator_id_fkey!inner(...)`, so a suspended officer's events currently drop off. Keep an id-only inner join when removing the identity, so this doesn't change by accident.
- In event_visible, drop the "creator always sees it" clause for club events.
- No edit or cancel route exists at all, so the new officer powers are DB-only and invisible. Say so.

A5 membership and chat roster.
- Do NOT column-revoke channel_members hidden_at/pinned_at/muted_until/cleared_at. The user's own settings are read with the cookie client at me/threads/route.ts:434-438 and lib/messages/channel-access.ts:77, and both fail soft. The retry regex matches "cleared_at" in a permission error. Result: hidden chats reappear, pins and mutes vanish, and cleared harassing threads come back.
- Defer that Low, or use a service-role or RPC read of the own row. Keep last_read_at readable.
- The club-post edit rule is already enforced in the route (posts/[id]/route.ts:554). Officer delete is DB-only until B2.
- Demotion (an UPDATE) doesn't drop private officer channels; flag it as a follow-up.
- The orgs column UPDATE revoke is safe: the PATCH uses the service role plus the word filter.
- The join refusal for a blocked pair must not reveal the block (see the decisions).

Moderators are unaffected: reports read target_snapshot with the service role. There is still no event takedown (events has no removed_at column).

## Ownership changes

- A3: explicitly own src/app/api/me/profile-views/route.ts and src/lib/metrics/profile-viewers.ts (free profile-view tiles read viewer ids via the cookie client under the policy A3 narrows).
- A5: drop the Low 'channel_members settings columns not readable by other members' from wave A. The fix needs src/app/api/me/threads/route.ts, which no batch owns, and a column revoke would reset every user's own hidden/pinned/muted/cleared state. Defer it to a chat batch that owns threads/route.ts plus channel-access.ts.
- A5 changes ensureMember in src/lib/messages/channel-access.ts, and A2's routes (me/threads/[id]/members, me/threads/[id]) may call it. A2 should review the new 403 path.
- If Franky takes the RSVP-on-removal decision, A5's org_members AFTER DELETE trigger also deletes rsvps (A4's table): A5 writes it, A4 reviews.
- A4: add the event_visible change (no creator bypass for club events) and the viewer_can_manage fix in src/app/api/events/route.ts:390 to its scope.
- A1: add 'drop bio from og:description when bio is hidden' to its src/app/profile/[handle]/page.tsx work.
- Follow-up, not wave A: api/stats/campus last_active_at count RPC, then revoke SELECT on users.last_active_at; officer Edit/Cancel event route and UI; moderator event takedown (B1 or later); demotion drops private club channels.

## Breakage risks

- A3: narrowing or dropping profile_views_owner_select without converting src/app/api/me/profile-views/route.ts makes every student's free 'Today / 7 days / N people' tiles read 0 silently (RLS returns zero rows, not an error, so the route's 500 guard never fires). Avoid: move it to the service role or a count RPC in the same batch, and check the tiles are non-zero in the browser walk.
- A5: revoking SELECT on channel_members hidden_at/pinned_at/muted_until/cleared_at breaks the user's OWN inbox (column grants are not row-scoped). threads/route.ts:434 swallows the error and channel-access.ts:83's retry regex matches 'cleared_at', so hidden chats reappear, pins and mutes reset, and cleared threads show their old messages. Avoid: don't column-revoke; read your own row with the service role or an RPC, or defer.
- A1: revoking SELECT on users.bio errors the inbox member hydration (threads/route.ts:465), which feeds the messages.html:2014 subtitle. Avoid: keep the grant and change the copy.
- A2: adding a block check to users_select_authenticated nulls names and avatars in every non-!inner users embed: DMs, club chat, group chats, member and follower lists. Avoid: block via posts/comments policies plus search, by-id and bootstrap routes only.
- A4: a CHECK constraint for past start (starts_at > now()) fails on 12 of 13 live rows and on any later UPDATE to a started event. Avoid: a BEFORE INSERT trigger with the route's 5-minute grace.
- A4: removing the creator:users!inner embed from the campus list silently brings back club events made by suspended or banned officers. Avoid: keep an id-only inner join, or decide it explicitly.
- A4: viewer_can_manage = isCreator || isOrgAdmin keeps showing a manage/attendees button to a demoted creator, who then gets a 403. Avoid: isOrgAdmin only for club events.
- A1: blanking must skip the 'self' relationship on /api/users/[handle]/bootstrap. Unverified viewers need a résumé empty state instead of a Download link that 404s.
- A5/A2: refusal copy for a blocked-pair join or group add must not reveal the block. Use the invite route's pattern (a neutral answer), not 'you are blocked'.
- A2: /posts/<id> for a blocked pair should say 'This post isn't available', not show a raw error.

## Live facts

- users: authenticated can SELECT bio, skills, work_experience, current_on, last_active_at, location_text, profile_view_count (plus name/handle/etc). profile_layout and resume_url are service-role only.
- profile_layout.hidden in use: 1 account hides experience, 1 hides resume, 1 hides skills; 0 hide bio.
- Blocks: 0 rows. The only policy mentioning blocks outside the blocks table is messages_insert_member, which applies only to non-club channels and refuses a send when ANY other member is in a block pair with the sender. So one block freezes both people in a shared group chat.
- posts_select_authenticated = (status='published' AND removed_at IS NULL AND user_visible(user_id) AND (org_id IS NULL OR org_content_visible(org_id))) OR user_id = auth.uid(); users_select_authenticated = id = auth.uid() OR user_visible(id); post_comments_insert_own and post_reposts_insert_own have no block check.
- profile_views: the only policy is profile_views_owner_select (auth.uid() = profile_user_id); post_views has RLS on and no read policy.
- events: 13 rows, 0 personal (org_id null), 12 already past, 0 over the route caps (120/2000/200), 0 whose creator is no longer an officer. There is no removed_at column. Policies: events_insert_authenticated (creator, consent, can_publish, owner/admin); events_update_creator USING creator only; events_delete_creator; event_visible lets the creator and any RSVP holder always see an event; can_manage_event = creator OR current owner/admin.
- FKs: posts.user_id, events.creator_id, post_comments.user_id and messages.user_id are all ON DELETE CASCADE to users, so deleting an officer's account wipes the club events and club posts they authored.
- org_members roles: owner/admin/mod/member. Live: 5 owners, 2 members, 0 admins/mods, and every officer is school-verified. Only 1 club is visible (verified); the rest are hidden test clubs.
- channels: 7 DMs (14 member rows), 3 groups (9), 10 public club channels (2 member rows), 2 private club channels (0). Stale club-chat rows (member no longer in the club): 0.
- No events edit/delete route exists (only GET/POST, plus attendees/ics/rsvp). The org PATCH writes with the service role plus the word filter, and the legacy public/html pages never write orgs or events directly.

## Questions for Franky (ruled in waveA-build.md)

- Hidden-widget wording (A1): the database can't hide bio/skills/experience/working-on from direct reads (bio also shows in the DM list). Recommend: say 'Hidden from your profile' for those, and keep 'only you see it' only for the résumé, which the server will truly lock.
- A blocked person's OLD comments on your posts (A2): today everyone but you still sees them. Recommend: they disappear for everyone; your comment section, your rule.
- Blocks and clubs (A5): recommend one-directional. If an officer blocked the student, their join/request quietly goes nowhere (it looks unanswered, and open clubs show 'Request to join'). If the STUDENT blocked an officer, let them join with a heads-up and hide their request from that officer. Never lock a victim out of a club because their harasser is an officer.
- Removed members (A5): recommend a removal lasts until an owner/admin lets them back (accepting a request or sending an invite). Officers see a small 'Removed before' tag on the request, and mods can't approve those. Keep mods out of invites for launch.
- Who manages club events and deletes club posts (A4/A5): recommend owner + admins only (mods moderate chat, not content), matching the existing club-post edit rule. An ex-officer can still delete, but not edit, a club post they wrote.
- Officer Edit / Cancel for club events (A4): right now officers can't fix a typo or cancel from the app at all. Recommend: a small batch right after wave A, where cancelling notifies everyone who RSVP'd.
- Events made by an officer who is later suspended (A4): recommend keeping today's behaviour (they drop off the campus list, like that officer's club posts). Don't let the creator-name cleanup change it by accident.
- Removal and RSVPs (A5): recommend that removing a member drops their RSVPs to the club's upcoming events, and a voluntary leave drops them only for hidden clubs.
- Before Vibe+ billing turns on (A3 follow-up): people get named in 'who viewed you' without any notice, and a harassment target who checks their harasser's profile gets named to them. Recommend a FREE 'browse privately' switch (LinkedIn-style: private browsers don't see viewer names either), plus a privacy-policy line.

