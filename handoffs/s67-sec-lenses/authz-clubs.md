# authz-clubs lens notes (S67 sec lenses, HEAD 24dac9f) — clubs/events/rsvps authz + IDOR

## Live DB (read-only SQL)
- Table grants (authenticated): orgs SEL+DEL, col UPDATE only name/description/logo_url/banner_url/tags/backdrop_preset/updated_at/links/philanthropy (NO owner_id/hidden_at/verified/campus) -> sound. No INSERT col grants on orgs -> orgs_insert policy moot.
- org_members: SEL+DEL, col UPDATE role only (no user_id/org_id move) -> sound. No INSERT.
- org_invites / org_join_requests / org_followers: SELECT only (writes service-role only).
- events: INSERT all cols; col UPDATE only id, org_id, creator_id, starts_at, ends_at, created_at (NOT title/desc/location); DELETE.
- rsvps: full INSERT/UPDATE/DELETE all cols.
- events_update_creator qual=creator only; with_check org_id NULL OR officer. events_delete_creator = creator only (no officer check).
- can_manage_event = creator OR officer -> ex-officer creator keeps attendee list. CANDIDATE.
- rsvps_insert_own = uid=user_id AND not restricted AND rsvp_on_home_campus(event_id). NO event_visible check -> RSVP by UUID to hidden-club event then event_visible() true via "has rsvp" branch. CANDIDATE (needs UUID leak).
- users.campus_id not user-updatable (good).

## Events
- /api/events POST: org required, verified, not hidden, owner/admin, checkText, length caps. BUT events_insert RLS allows org_id NULL or any org where caller is owner/admin — no verified/hidden/text/length check; no events triggers; no length CHECKs. Any verified student can create a club (orgs POST, 5/h) -> owner of unverified club -> direct PostgREST insert events for it -> shows on campus events list (byOrg includes all non-hidden campus orgs; RLS event_visible true). FINDING (bypass verified-only + text filter).
- No event edit/delete route; events UPDATE/DELETE only reachable via PostgREST; creator-only -> ex-officer creator keeps delete + org_id->NULL detach + attendees (can_manage_event + attendees route line 53 creator check). FINDING.
- attendees route: creator or owner/admin, under RLS. Identities not shown to others. sound except ex-creator.
- ics route: RLS read, sound (leaks error.message on DB error, trivial).
- events GET list: hidden filter by id list, attribution service-role, sound.
- search events: RLS event_visible; orgs search .is(hidden_at,null). sound.
- me/upcoming-events: own rsvps under RLS. sound.
- rsvp route PUT: hidden org 404 + campus rule. DB rsvps_insert_own lacks hidden-org check -> direct PostgREST RSVP to hidden-org event by UUID; then event_visible's "has rsvp" branch exposes event row. Needs UUID. Low.
- event_rsvp_counts: gated by event_visible. sound.
- org_member_role/is_org_member: self-only for authenticated. sound.

## Orgs / members / followers
- orgs/[slug] GET: service read, orgJoinState -> not_found for hidden non-member. sound. PATCH: explicit owner/admin + requireCanPublish + whitelist. DELETE: owner_id only. sound.
- BUT orgs col UPDATE grants (name, description, links, philanthropy, tags, logo/banner) + orgs_update policy -> officer can PATCH /rest/v1/orgs directly, skipping checkText, name 2-50/desc 400 caps, sanitizeLinks URL_RE, Terms/school-verified (with_check only has NOT is_restricted_now). Any verified student can own a club (orgs POST). links rendered href={l.url} at src/app/orgs/[handle]/page.tsx:1036 (React 19 blocks javascript:). FINDING (Medium-ish, overlaps injection lens).
- members/[userId] PATCH/DELETE route: only owner may demote/remove admins. RLS org_members_update/delete let ANY admin demote/delete another admin directly. FINDING.
- members GET route = members-only (403). RLS org_members_select lets any signed-in user read roster of open+public+not-hidden clubs (deliberate in 20260916103000:778-788). FINDING (roster identity leak vs route rule).
- followers GET / followers/[userId] DELETE: owner/admin only, hidden 404 for non-members, blocked filtered, cursor validated (uuid + ts regex). sound.
- follow POST/DELETE: hidden -> 404 for non-members; members can't unfollow. sound.
- proxy blocks restricted users on non-GET /api (mitigates routes w/o restriction check).
- Roster: campus-map/zone org zone (src/app/api/campus-map/zone/route.ts:134-155) ALSO names open-club members to non-members under RLS, so open-club rosters are public by design; members GET 403 is just the mgmt UI. DOWNGRADED -> coverage note only.
- invites POST/[id] DELETE: officer gate, hidden 404/409, blocks, audience, caps; revoke scoped by org_id. sound.
- join POST: orgJoinState (hidden->404, audience, invite_only, visiting->request), admitMember service. sound. org_members has no INSERT grant -> no direct self-join.
- requests list/decide: officer (incl mod) gate, request scoped by org_id, audience re-check. sound. Hidden-handle oracle: 403 "Staff only" vs 404 on missing (requests, members/[userId], PATCH/DELETE org). Low.
- channels/*: channel.org_id === org.id check, reorder filters ids by org. sound.

## More
- posts insert: no org_id INSERT grant -> can't post as a club directly. sound.
- org_channel_members insert policy: officer of channel's org; doesn't require target be member, but can_view_org_channel requires is_org_member -> harmless.
- me/org-invites/[id]: scoped eq invitee_id=user. sound. admin hide: requirePlatformAdmin. sound.
- rsvps: only writers are user-client (route upsert + PostgREST) -> all go through rsvps_insert_own/update_own with rsvp_on_home_campus. No service-role rsvp write. sound for campus rule. BUT DB has no consent/school-verified/hidden check; campus-less viewers (12/20 users live, all 6 unverified + 6 verified) exempt both route+DB. Low.
- FINDING: join route (can_join / can_request) has NO block check, unlike invites isBlockedWithOrg (invites/route.ts:439,648). Blocked student can send join request w/ 500-char message (join/route.ts can_request insert) to owner/officers; requests list shows name+message, no block filter. And removals aren't recorded (join-state.ts:151 "nothing records removals yet") -> removed+blocked member rejoins open club instantly. Medium.
- events direct insert: starts_at far past + ends_at far future passes .gte(ends_at,now).lte(starts_at,horizon) and sorts FIRST (order starts_at asc, limit 50) -> 50 spam rows push real events off every student's campus list. Raises events finding impact.
- events GET spreads creator embed (id,name,handle,avatar,campus) for club events (route.ts:186,387) though UI shows only "by {org}" (campus-home.tsx:9272-9285); contradicts A4 note at orgs/[slug]/route.ts:239. Low.
- Hidden-handle oracle routes (403 not 404 for hidden non-member): requests GET/POST, members/[userId], org PATCH/DELETE, posts POST, upload-url, channels POST. Low.
- No escalation path found: org_members UPDATE with_check blocks ->admin unless owner, ->owner never; owner_id/hidden_at/verified not granted; no ownership transfer route.
- Live counts: 5 orgs (3 verified, 4 hidden), 13 events (0 org-less, 0 on unverified orgs, all creators still officers), 0 admins, 7 rsvps, 0 hidden-event rsvps by non-members -> no sign of use.
## DONE — returning findings
