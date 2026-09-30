# authz-posts-admin-scope lens notes (S67 security sentinel, HEAD 24dac9f, read-only)

## Live DB state (read-only SQL)
- All S67 migrations 20260926100000..20260927142000 are applied on prod (schema_migrations).
- posts grants (authenticated): INSERT user_id,type,content,media_url,media_thumbnail_url,tags,status; UPDATE content,tags,status; DELETE table-level (policy posts_delete_own). org_id NOT insertable -> orgs/ branch of post_media_ref_ok unreachable via PostgREST. SOUND.
- posts triggers: posts_check_media_refs (INSERT / UPDATE OF media cols), posts_stamp_campus (campus+system forced from author; frozen on UPDATE), posts_stamp_edited (published->draft refused). status CHECK draft|published, type CHECK post|clip. SOUND.
- users UPDATE grants: year,department,resume_url,voice_samples,last_active_at,website,otto_settings,current_on,resume_redactions,work_order_manual,resume_docs. campus_id / campus_set_at / profile_layout / school_system NOT client-writable. users has only trigger users_campus_in_system. -> resume_url/resume_docs/voice_samples have NO ownership trigger: CHECK /api/resume.
- /api/resume: owner derived from key's first segment + owner row must reference key -> writable users.resume_url/resume_docs buys nothing. SOUND.
- posts DELETE route: rate-limited, owner check, R2 delete only clips/<caller>/. SOUND. media route: signs only own-folder keys; removed/restricted/hidden-club gates. SOUND (no block check; signed-out = report #9).
## CANDIDATE A (Medium): blocks not enforced in RLS for posts/users SELECT, nor in GET /api/posts/[id]
- posts_select_authenticated = published & not removed & user_visible(author) & org visible; user_visible checks only account_restrictions. No blocks.
- users_select_authenticated = self OR user_visible(id). No blocks.
- /api/users/[handle]/posts:63-73 and bootstrap DO hide on block -> product intent. /api/posts/[id] GET (route.ts:108-200) no block check.
- Blocked student: GET /rest/v1/posts?user_id=eq.<victim> & /rest/v1/users?id=eq.<victim> with own JWT. Signed-in variant of report #9 / lost lens #6.
- Block dialog copy (ProfileMobile.tsx:5890) promises blocked person can't "see your posts, or find you in search" -> strengthens candidate A.
## CANDIDATE B (Medium, NEW S67): hiding a profile widget is cosmetic; data still served
- UI: ProfileMobile.tsx:370 "hidden · only you see it", :4707 "The eye hides a section from everyone but you."
- users/[handle]/bootstrap/route.ts:29 PUBLIC select always includes bio,resume_url,resume_docs,skills,work_experience,current_on; :37 comment: visitor page "drawn from" the hidden set = client-side hide only.
- /api/resume signs for any signed-in non-blocked viewer while owner row references key (no layout check).
- PostgREST users SELECT grant (authenticated) includes bio,skills,work_experience,current_on.
- Campus lock: users.campus_id/campus_set_at not client-writable; /api/me/profile + onboarding-step both call campusChangeDecision (onboarding-prefill.ts:438-454). Lock applies ONLY when onboarded (otto_answers non-empty).
## CANDIDATE C (Low/Med): legacy POST /api/me/onboarding-complete resets otto_answers to {} -> un-onboards -> campus lock + handle cooldown off
- onboarding-complete/route.ts:218-229 finishLegacy accepts any object incl {} (no v field); :259-266 writes otto_answers:{} with service role; no "already onboarded" gate.
- post-login.ts:7-10 isOttoOnboardingComplete({}) = false.
- onboarding-prefill.ts:445 lock only `if (setAt && ... && input.onboarded)`; handle-change.ts handleClaimPolicy freeClaim when onboarding && !complete (onboarding-step profile step).
- Then PATCH /api/me/profile {campus_id} or onboarding-step {step:campus}; then re-finish (v:2 or legacy with real answers). Loop.
- Same legacy path writes name/bio/major/department/interests/skills/work_experience (sanitizeOnboardingProfile) with NO requireNotRestricted and NO blockedProfileField text filter (compare profile/route.ts:116,178). /api/me/handle + onboarding-step also skip checkText + requireNotRestricted.
- Admin: all 12 /api/admin routes call requirePlatformAdmin (service-role read of is_platform_admin); restrict refuses self + admin targets. Other is_platform_admin reads all service-role. SOUND.
- Quarantine: authorPostMediaPath requires owner==author, folder posts|posters, one file segment, no .. or %. SOUND.
- Tags XSS: _postViewer tagChipsHtml + profile.html grid/_publishProfilePostLocal all _esc(). Strip is React. No XSS found.
## CANDIDATE D (Medium): Trending strip (S67) inflatable + unfiltered via direct tags write
- trending/hashtags/route.ts: counts every array element per post (no per-post dedupe, no distinct-author), scans 500 rows w/o order.
- posts.tags INSERT+UPDATE granted to authenticated; no CHECK on tags (constraint list). publish-post normalizeTags (word chars, dedupe, MAX_TAGS) is route-only; checkText only on content (publish-post:167), never tags.
- One PostgREST insert {tags:[<phrase> x 5000]} -> #1 trending "5000" on home campus for every viewer, and for anyone browsing ?campus=. UPDATE tags on an existing published post also works (grant) -> can change after review.
- Live counts: 23 posts, 0 org posts, 0 rows failing post_media_ref_ok (no legacy bad refs).
## CANDIDATE E (Medium): former/demoted club officer can rewrite the club's posts via PostgREST
- PATCH /api/posts/[id] route.ts:545-561 refuses org-post edits unless author is still owner/admin ("Only owner / admin can post as the org").
- RLS posts_update_own = auth.uid()=user_id (+consent, can_publish_now); UPDATE grant content,tags,status. No org-role check in DB -> PATCH /rest/v1/posts?id=eq.<clubpost> {content,tags} works after removal/demotion; also skips checkText.
- DELETE route (route.ts:360) also lets a former officer delete club posts (author==caller, no role check) - may be intended ("author never locked out").
- Exposure today: 0 org posts.
## CANDIDATE F (Low): /api/orgs/[slug]/posts POST - service insert with no requireCanPublish/requireNotRestricted/school_verified and no checkText on content (grep: only rateLimit + requireTermsAccepted). Restricted author's rows are hidden by user_visible, so mainly a text-filter bypass for "speak as the club".
- users direct-writable cols: website rendered via textContent (profile.html:8547), current_on/resume_docs re-sanitized on read (normalize-profile-view.ts:86,92). otto_settings self-only (theme boot = localStorage, push prefs self). entitlements not client-writable. SOUND.
- viewers route: assertPostOwner (cookie client, row.user_id===caller) + hasPlus(entitlements). SOUND.
## CANDIDATE G (Low): author can hard-delete a moderator-removed post (and its R2 video)
- admin/content/remove/route.ts:34-37 "SOFT REMOVAL, always: the row stays ... evidence ... still there if the student appeals"; :48 R2 video stays in R2.
- posts_delete_own (auth.uid()=user_id, no removed_at cond) + DELETE /api/posts/[id] (route.ts:344-397 no removed_at check) -> row gone, clips/<author>/ video DeleteObject'd. Matters for child_safety/intimate_image evidence.
- CANDIDATE A extended: post_comments_insert_own = uid + consent + can_publish_now + post visible; no blocks. comments route authorBlockCheck (comments/route.ts:39-70) refuses; GET hides blocked person's comments only from the blocker (:73) -> blocked harasser's direct-insert comment shows to everyone EXCEPT the victim. notify trigger inserts notification (filtered in /api/me/notifications by hidden ids). post_reposts insert also no block check (repost route checks).
- post_comments INSERT is table-level: client can set removed_at/removed_by/removed_reason/created_at/id on own comment (cosmetic).
## CANDIDATE H (Low, billing off): profile_views_owner_select lets owner read viewer_user_id directly -> Vibe+ "who viewed your profile" without Plus (route requirePlus at profile-viewers/route.ts; loadProfileViewers uses cookie client). Also skips hidden-user filtering if any.
- E strengthened: notYourPost (posts/[id]/route.ts:295-303) -> club owner gets 403 on a former officer's club post; only platform admin can take it down.
- rsvp_on_home_campus fails open when viewer campus_id null (by design); rsvps_insert_own has no consent/verified check (events lens).
- stats/campus, campus-map, zone: cookie client (RLS). events GET: RLS + service hidden-org exclusion. search: orgs via service with hidden_at is null. ?campus= scope SOUND for hidden clubs/posts in my area.
- pinned: own posts only. me/posts: eq user_id=caller. SOUND.
## DONE - reporting A (Med), B (Med), E (Med), D (Med), C (Low), G (Low), H (Low), F (Low)
