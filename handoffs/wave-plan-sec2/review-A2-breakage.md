# Review A2 (blocks in the database) — breakage lens

Reviewer started 2026-09-27. Read plan.md, waveA-build.md, approach-A2.md, notes-A2.md.

## Progress
- [x] Migration read end to end. Pre-flight pins only posts/post_comments SELECT + the 4 cascade
  WITH CHECKs + users SELECT + 3 fn md5s. No other wave-A/B migration (100000/110000/130000/140000/
  150000/160000) alters any of those (grep of alter/create/drop policy + fn replaces): no order clash.
  A5b 150000 changes posts_update_own only. ROLLBACK restores both quals and drops the helper (policy
  first, then function): complete.
- [x] pair-block.ts diff: additive only (groupBlockFilter + loadGroupBlockConflict); no existing export changed.
- [x] members route, threads route (create + GET roster), threads/[id] PATCH, by-id, posts/[id] GET, comments POST read.
  No client reads peer.bio except messages.html:2014 (`peer.school || peer.bio || ''` -> school-or-blank). OK.
  public/html has NO direct PostgREST reads of posts/post_comments/post_reposts/bookmarks.
- [x] Callers of posts/post_comments (24 src files, embeds in bookmarks/notifications/otto/messages): every cookie
  read uses maybeSingle or list; null embeds already handled (notifications post/comment, chat attachment,
  OttoSidePanel/_otto.js comment?.content). Repost DELETE + save DELETE have no post check -> un-repost/un-save
  still works across a block. Admin remove/restore read with service. No new 500 found from the RLS change.
- [x] report-visibility.ts rule matches the pre-A2 policy (user_visible == no active restriction of any kind,
  same filter as getActiveRestriction; org check viewer-relative via orgContentAccess cookie user).
- [x] Tests: node --test on the 4 A2 test files 46/46 pass. tsc --noEmit -p . exit 0 (whole tree).
- [x] LIVE re-read (read-only MCP, just now): all 7 policy fps + 3 fn md5s match the PRE-FLIGHT; posts and
  post_comments each have only the one SELECT/ALL policy; blocks.id exists (4e's order by b.id); blocks 0;
  post_comment_block_hidden absent. PRE-FLIGHT will pass on prod as of today.
- [x] members route success/already shapes unchanged ({ok:true} / {ok:true,already:true}); MessagesMobile
  prints j.error (so 409/403 copy shows); messages.html multi-add toast shows generic "couldn't be added. Try
  again." for 403-refused / 409-full (not A2's file; shouldFix note).
- [x] comments POST 42501->404: requireCanPublish mirrors can_publish_now/has_recorded_consent, so a 42501
  there is essentially only the EXISTS(posts) race. OK.
- [x] (resumed 2026-09-28) Re-read diffs: threads/[id] PATCH only handles name/photo, so requireCanPublish
  doesn't lock anyone out of mute/pin/leave (those live elsewhere). resolveMembers strict isUuid + lower:
  a non-strict id now goes to the handle lookup and is simply not found (was a 22P02 500 before). OK.
- [x] reports crossBlockFallback read end to end: own-post branch (viewer = post author) passes, pair-hidden
  comment for a third party stays not_found (they can't see it either). No new 500 path except real read errors.
- [x] by-id: only caller profile.html:7051 treats any non-ok as "fall back to cached handle". OK.
- [x] Other readers of posts/post_comments policies: only bookmarks_all_own / post_reposts insert+update WITH CHECK
  (no views, no invoker fns, no storage policies). bookmarks USING is own-only, so un-save across a block works.
  Comment-like, save, repost, pinned, trending, feed, creator-stats all read via cookie client and 404/drop cleanly.
  Message attachment embed is a left join (null attachment, handled). users/[handle]/reposts filters hidden authors.
- [x] Local fps now 19ad5936.../24311c96... (as builder said). No other wave migration touches a pinned object.
  postgres is a non-superuser member of authenticated locally (same as hosted), so the set-local-role probes run.
- [x] Group create/add clients: messages.html create alerts j.error; no client reads not_connected; cap math
  unchanged (n+1 <= 50 create, >= 50 full on add). No client reads peer.bio except messages.html:2014 (fine).
- [x] node --test (4 A2 files) 46/46; tsc --noEmit -p . clean.

## Verdict: ship. No mustFix.
shouldFix:
1. comments POST isRlsRefusal treats EVERY 42501 as 404 with no log (a future column-privilege revoke would
   silently read as "post not found"): console.error the error before answering 404, or match the RLS message.
2. posts/[id] GET: the block check sits under the hidden-club comment block; move the H7 comment down to the club check.
3. messages.html multi-add toast shows generic "couldn't be added" for the new 403/409 copy (not A2's file).
4. /api/search ignores a blocks-read error (unowned; noted by builder).
