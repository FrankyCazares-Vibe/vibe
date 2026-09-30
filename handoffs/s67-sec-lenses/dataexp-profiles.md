# dataexp-profiles lens notes (S67 sec, HEAD 24dac9f) — read-only audit of people-data exposure

## Prior report (2026-09-27) items in my area
- #8 non-students read users/posts (Medium), #9/#25 anon reads profiles via /api/users/[handle]/bootstrap (Medium), #15/#24 Vibe+ savers/viewers identities (Medium; S67 wave says savers count-only), #28/#37 signup reveals email exists (Low), #38/#50 is_platform_admin column listable (Low), #37/#40 localStorage profile cache (Low). Dataexp lens results were LOST — this lens re-covers them.

## Live users column grants (read-only SQL, 2026-09-27)
- anon: no SELECT on any users column. authenticated: NO SELECT on email, school_email, resume_url, resume_docs, resume_redactions, looking_for, otto_answers, voice_samples, recruiter_snapshot, is_platform_admin, otto_settings, terms/age, campus_set_at, profile_layout.
- => prior #38/#50 (is_platform_admin listable) is FIXED at 24dac9f (auth_sel=false).
- authenticated CAN SELECT: bio, skills, work_experience, current_on, location_text, last_active_at, handle_changed_at, profile_view_count, campus_id, school_system, created_at.

## FINDING A (candidate, Medium): hidden profile widgets only hide the box, not the data
- UI promise: ProfileMobile.tsx:370 "hidden · only you see it"; profile.html:7757 "hidden · only you can see this".
- /api/users/[handle]/bootstrap/route.ts:28-40 selects bio, work_experience, skills, current_on, resume_url, resume_docs regardless of profile_layout.hidden; nothing strips (normalize-profile-view.ts:98 only sanitizes layout; build-vibe-user-v1.ts:171-175 copies hidden list). Signed-in viewer gets resume_docs (line 220-274 only redaction-strips).
- /api/resume/[...path]/route.ts:141-200: serves any key referenced in owner's row to any signed-in user; never reads profile_layout. So a HIDDEN resume is still downloadable.
- bio/skills/work_experience/current_on are also directly SELECTable via PostgREST by authenticated -> route fix alone won't hide those.

## FINDING B (candidate, Medium/Low): anon /api/users/<h>/posts serves a suspended/banned student's posts
- posts/route.ts: anon => reader = service client (line ~48); target lookup by handle via service has no restriction check; grid filters removed_at + status only. RLS path uses user_visible() (hides restricted) but service path bypasses it. Bootstrap route (155-166) does the restriction 404; posts route does not.
- /account/suspended copy promises profile/posts invisible. Live: 0 active restrictions, 1 total -> latent today.
- Checked sound: followers/following/connections/mutuals require sign-in; target lookup via cookie client (user_visible hides restricted); pair-block -> empty page.
- Finding A live: 1 user today has 'resume' in profile_layout.hidden AND has resume docs -> that hidden resume is downloadable by any signed-in account right now (count-only SQL; row contents not read).

## FINDING C (candidate, Medium): /posts/<id> OG metadata ignores removal, bans and hidden clubs
- src/app/posts/[id]/page.tsx:29-42 generateMetadata: service read, filter status='published' ONLY. Emits author name + content(60 in title,140 in desc) + og:image. No removed_at, no restriction, no org hidden_at check. RLS posts_select_authenticated requires removed_at is null AND user_visible AND org_content_visible — OG bypasses all 3. Page body 404-check (line 113-118) also service, no filter; unauth -> redirect to login but OG already in HTML head.
- S67 wave fixed /api/posts/[id]/media for removed/restricted/hidden (media/route.ts:38-47,95-109) — the text preview was missed. Live counts: 0 removed posts, 0 hidden-club posts today -> latent.

## FINDING D (candidate, Low/Medium): /profile/<h> OG + 200 for banned users and hidden bio
- src/app/profile/[handle]/page.tsx:26-33 service select name,tagline,bio,avatar_url; no restriction check; description = tagline || bio[0:160] regardless of profile_layout.hidden 'bio'. Page 200 vs bootstrap 404 for restricted users.
- Checked sound: orgs/[handle]/page.tsx:123 hidden club -> generic title.
- LIVE CONFIRM (anon curl, founder's own profile only): GET /api/users/frankycazares/bootstrap (no cookies) -> profileLayout.hidden = [experience, skills, resume], yet payload carries workExperience (2 items) and skills (3 items). Hiding = box only. /profile/frankycazares 200 with og:description from tagline.
- anon /api/users/<h>/posts 200, bootstrap 200; unknown handle 404 on both (handle enumeration = by design, public share links).

## FINDING E (candidate, Medium): blocks are route-only; RLS lets a blocked user read the blocker's profile row, posts and comments directly
- Live pg_policies: users_select_authenticated = id=uid OR user_visible(id); posts_select_authenticated / post_comments_select_authenticated: no blocks clause; no RESTRICTIVE policies on these tables.
- authenticated column grant includes last_active_at, location_text, bio, work_experience, current_on (see grants above).
- Promise: public/html/_safetyActions.js:145 "They won't be able to message you, see your posts, or find you in search"; MessagesMobile.tsx:2427 "won't be able to see your profile".
- Route layer does enforce (bootstrap 182-210, followers pair-block, resume 180-197) but /api/users/by-id/[id]/route.ts:26-30 has NO block check either (RLS read of name, handle, avatar, school, major, year).
- Distinct from prior #25 (anon logout path): this is signed-in, via /rest/v1, and includes last_active_at (online-activity signal) which anon routes don't give.

## FINDING F (candidate, Medium): "Who viewed your profile" (Vibe+ paid line) readable free straight from PostgREST
- Live: profile_views RLS policy profile_views_owner_select (auth.uid() = profile_user_id); authenticated SELECT on viewer_user_id, viewed_on, first_viewed_at, referrer. 43 rows across 14 owners; 1 entitlement row.
- Route /api/me/profile-viewers/route.ts:50-51 requirePlus() then loadProfileViewers (src/lib/metrics/profile-viewers.ts:138-150: window + drops blocked/muted). Direct GET /rest/v1/profile_views?select=viewer_user_id,... skips Plus gate, time window and block/mute filter; then users?id=in.(...) gives names.
- Migration 20260513000000 comment: "The viewer-list endpoint will be gated separately" — the gate was put in the route only.
- post_views: RLS on, NO policies -> no rows to authenticated (sound). bookmarks: own-only (sound). savers route count-only at 24dac9f (sound, prior #15/#24 savers half fixed).

## Prior #8 STILL exploitable at 24dac9f, and it reaches RESUMES (variant)
- /api/resume/[...path]/route.ts:127-133 only requires a session (no school_verified, no terms); bootstrap route gives resume_docs to any signed-in viewer (220-274). src/proxy.ts has no school_verified gate. Live: 4 users have resumes, 6 of 20 accounts unverified. A Gmail-only account can download every student's (redacted) resume.
- /api/resume also never checks the OWNER's restriction (bootstrap 404s a banned student's profile but a held key still serves) - Low.

## FINDING H (candidate, Low): rpc/user_visible is a "is this student suspended/banned?" oracle
- user_visible(p_user_id) SECURITY DEFINER, EXECUTE granted to authenticated (and anon, but anon -> false). Returns false ONLY when an active account_restrictions row exists; true for unknown/deleted ids. Any signed-in user: POST /rest/v1/rpc/user_visible {"p_user_id": X}.
- bootstrap/route.ts:133-135 deliberately makes restricted == unknown ("who a moderator has acted on ... nobody else's business"); the RPC undoes that.
- Checked sound (self-scoped by auth.uid()): is_restricted_now, can_publish_now, has_recorded_consent, is_blocked_either_way, is_muting_now, is_org_member, org_member_role, is_channel_member, mutual_follow_counts, second_degree_follows.
- Finding C LIVE: anon curl of founder's own post /posts/3f859f35-... -> 307 to /auth/login, but the 307 BODY still carries og:title "<author>: <content…>" + og:description (checked with plain curl and facebookexternalhit UA). So the post text reaches anyone with the id, without sign-in, and the query has no removed/banned/hidden-club filter.
- Prior #37 (signup reveals existing email) still present: signup/page.tsx:244-262, 501. Password-reset route sound (generic answer, work in after()).
- Finding B widened: anon /api/users/<h>/posts grid (service read) has NO org filter either. Org posts are inserted with user_id = posting officer (orgs/[slug]/posts/route.ts:171-176), so a HIDDEN club's post text + org_id show in the officer's public grid to anyone signed out. RLS path hides them via org_content_visible. Live: 0 org posts, 4 hidden orgs -> latent, but first club post in a hidden (test) club leaks.
- Finding E extra evidence: GET /api/posts/[id]/route.ts:123-165 has no block check (only hidden-club check); blocked user with a post link reads it in-app.

## Coverage / sound
- Sound: owner profile-bootstrap (self only, email only to self); users/search + /api/search people (RLS + school_verified + discoverable + blocks; minor: users/search block read ignores {error} -> fail-open, route only); followers/following/connections/mutuals (auth, rate-limited, pair-block, hidden set); reposts route (auth, hidden club drop); savers count-only; post viewers + profile-viewers routes Plus-gated; notifications scoped to self; post_likes/post_reposts own-only; post_views no policies; password-reset generic + after(); school-email request 409/403 behind 3/h user + 60/h IP limits (accepted residual); orgs/[handle] OG hides hidden clubs; SECURITY DEFINER helpers self-scoped except user_visible.
- Fixed since prior report: #38/#50 is_platform_admin column no longer SELECTable by authenticated.
- Still present, not re-reported: #8 (non-students read), #25 (anon profiles/posts), #37 (signup email exists).
DONE — final severities: A Medium, C Medium, E Medium, F Medium, B Medium, #8-resume variant Medium, D Low, H Low.
