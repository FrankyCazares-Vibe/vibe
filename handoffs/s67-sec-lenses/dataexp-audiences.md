# dataexp-audiences — S67 sec lens notes (identities behind counts), HEAD 24dac9f, 2026-09-27

## Checked, sound (so far)
- /api/me/posts/[id]/savers: count only, owner-gated via cookie-client assertPostOwner, no ids leave (route.ts:87-91). Prior #24 savers part CLOSED.
- /api/me/posts/[id]/viewers: free = total only; Vibe+ = names, owner-only. As designed.
- creator-stats: saves via service role, counts only.
- RLS live: bookmarks own-only; post_likes/post_reposts select own-only; post_views 0 policies; profile_views owner select; notifications own; org_followers self or owner/admin; rsvps own or can_manage_event.

## Candidates to trace
- SECURITY DEFINER oracles exec by authenticated+anon: is_org_member(oid,uid), org_member_role(oid,uid), is_blocked_either_way(a,b), is_muting_now(a,b), can_view_org_channel(cid,uid)
- org_members_select: open+public+not hidden orgs expose rosters to all authenticated
- SECDEF oracles is_org_member/org_member_role/is_blocked_either_way/is_muting_now/can_view_org_channel: all guard uid=auth.uid() for authenticated, false for anon. SOUND.
- events/[id]/attendees: creator or org owner/admin (cookie client + RLS can_manage_event). Sound (minor: ex-officer creator keeps list — can_manage_event keys on creator_id alone).
- events GET: returns host + counts only; hidden org id -> []. Sound.
- me/upcoming-events: own rsvps only. trending/hashtags: tag counts from RLS-visible posts. strip-data: only these two. SOUND.

## FINDING A (Medium): free tier reads "who viewed your profile" straight from PostgREST
- RLS profile_views_owner_select qual (auth.uid() = profile_user_id); authenticated has SELECT on viewer_user_id, viewed_on, referrer, first_viewed_at (live has_column_privilege = true).
- users name/handle/avatar readable by authenticated (users_select_authenticated user_visible).
- Route src/app/api/me/profile-views/route.ts:13-17 promises "a free account does not receive them" -> hollow. Also no blocked/muted filter on the direct path.
- post_views: 0 policies -> no equivalent bypass for post viewers (sound).

## FINDING B (Medium, S67 new): "hidden · only you see it" widgets still ship to every visitor
- ProfileMobile.tsx:370 copy; profile-layout.ts:31 "A view flag: hiding deletes nothing."
- users/[handle]/bootstrap/route.ts:28-40 selects bio,work_experience,skills,current_on,resume_url,resume_docs (service role, anon allowed) with no strip on layout.hidden; build-vibe-user-v1.ts:166-177 just forwards hidden ids.
- /api/resume/[...path] never reads profile_layout -> hidden resume downloadable by any signed-in user.
- Direct PostgREST: authenticated SELECT on users.work_experience, skills = true.
- Live: 1 user has hidden resume + experience today (count only).

## FINDING C (Medium): mute-diff oracle turns the count-only savers/viewers totals into a who-saved / who-viewed list
- /savers total = distinct savers minus blocked+muted (savers/route.ts:76-91, post-audience.ts:330-334); /viewers free total same (viewers/route.ts:112-131).
- posts/[id] GET counts.saves (route.ts:274-285) hides nobody -> counts.saves - savers.total = #savers inside your mute set.
- mutes_insert_own / mutes_delete_own: silent, no rate limit via PostgREST; loadHiddenUsers reads active mutes live (hidden-users.ts:35-50).
- Author mutes candidate X (or a group), re-reads total, unmutes -> learns whether X saved/viewed. Free tier learns post viewers (paid line); every tier learns savers ("Only you can see your saves").

## FINDING D (Low, latent): ex-officer who created a club event keeps its RSVP list forever
- attendees/route.ts:53 allowed = ev.creator_id === user.id (no current-role check); RLS can_manage_event also keys on e.creator_id alone -> direct PostgREST rsvps?event_id=eq.X works too.
- Live: 13 org events, 0 with a creator who is no longer owner/admin (latent today).

## Dropped candidate
- org_members_select exposes open+public club rosters to all authenticated: consistent with campus-map/zone org bucket (zone/route.ts "an org's members are its members") -> by design; 0 visible open clubs today anyway.
- users follow lists public by design (users/[handle]/followers docblock) -> mutual_follow_counts oracle irrelevant.
- profile view referrer: not surfaced anywhere.

## More checked, sound
- notifications GET/count: cookie client, own rows, hidden actors excluded; org embeds via service drop hidden clubs. No save/view notification types exist (type check).
- orgs/[slug]/followers: owner/admin only, hidden org 404 for non-members; follower_count floor 5 applied in orgs list/GET/profile/follow; SSR org page renders via followerCountText only.
- orgs/[slug]/members: members only (hidden -> 404). invite-candidates: officer gate + canSeeFollowers.
- feed friend reposters: reposts are public on profiles; only followed people.
- hasPlus/getEntitlement fails closed. /api/me/profile-viewers uses requirePlus.
- No legacy /html page reads audience tables directly.
- Anonymous live GETs: savers, profile-views, attendees, upcoming-events, trending -> 401.
