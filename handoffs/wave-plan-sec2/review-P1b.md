# Review P1b (2026-09-28) — PATCH tag parity, restore into a deleted club, RollingStrip comment

Verdict: **SHIP.** No must-fix. All three items close their gap; nothing found that breaks.

## What I checked
- Diffs: PATCH hunk in src/app/api/posts/[id]/route.ts, new src/lib/posts/post-tag-filter.ts (+ test),
  content/remove and content/restore routes, RollingStrip.tsx:219.
- Gates, re-run by me: node --test post-tag-filter + caption-tags + tags + edit + rolling-strip-view 52/52;
  npm test 1253/1254 (only the known parse-reminder); tsc --noEmit exit 0; eslint clean on all 6 files.
- Local DB (docker supabase_db_vibe, rolled back): re-ran the builder's sim.sql -> SIM PASS; org back,
  moderation_actions still 3 rows. Grants: authenticated has no INSERT/SELECT on moderation_actions and no
  UPDATE on posts.org_id / removed_at, so the log and the columns the check reads can't be forged.
  service_role SELECT on moderation_actions: yes. FK is ON DELETE CASCADE; orgs_keep_removed_posts present.

## Item 1 — PATCH tag filter parity: CLOSED
- PATCH now runs `firstBlockedPostTag(extractPostTags(c.content), c.content)` =
  `firstBlockedTag([...stored, ...captionHashtags(content)])`, the same union publish-post:158 runs.
  Every caption #tag is in the union on both sides, so an 11th tag, `#café_<term>` and an over-32 tag are
  refused on edit exactly as on publish. Answer is the ordinary 422 content_blocked; the word is never echoed.
- Tests build positives from filterTerms() (no term typed), prove the old stored-only filter missed each case,
  and assert edit == publish on a caption set. Good.
- Other writers: only PATCH updates posts content via a route. Direct PostgREST UPDATE by the author still
  skips the word filter (recorded follow-up F4; unchanged by P1b).

## Item 2 — restore into a deleted club: CLOSED
- remove: posts select org_id; log meta gains `org_id` (club or null), posts only. Response shape unchanged;
  log-client ignores unknown meta keys.
- restore: removed post with org_id null -> reads ALL post_remove rows naming an org_id; any named club gone ->
  409 club_deleted "This club was deleted, so the post can't be put back.", nothing changed. Read error -> 500,
  nothing changed (fails closed). Old rows without org_id / personal posts restore as before. A second remove
  after the delete (org_id null) doesn't unlock it (all rows are read).
- Race: the update is compare-and-set on the org_id the check saw; a club deleted in between detaches the post
  (trigger), 0 rows, re-read -> still removed -> 409, files stay in quarantine. A concurrent admin restore ->
  finishes as before. Verified in SQL.
- Bypass hunt: the only removed_at-clearing code is this route and actions.ts restoreContent (0 callers). No
  appeal route restores posts. No admin screen calls content/restore today, so the 409 has no UI consumer
  (Light/Night unaffected).

## Item 3 — RollingStrip.tsx:219: DONE ("1 person this week", matches tagChipTitle).

## Should-fix (not blocking)
1. The restore gate trusts the removal's log row. If `logModerationAction` fails at removal (answer says
   `logged: false`) and no report was closed, pressing Remove again writes no new row (changed=false,
   resolved=0), so org_id is never recorded; a later club delete + restore republishes the club post as
   personal. Narrow (log failure + club delete + deliberate admin restore). Options: write the log row on a
   repeat Remove when no post_remove row exists yet, or have the detach trigger leave its own record.
2. restore route header still says "CHANGE BOTH TOGETHER" with restoreContent, which now lacks the club check
   (and already lacked the media release). Add the same one-line known-gap note the remove route got.
3. orgs/[slug]/posts (club publish) runs checkText only, not the caption-hashtag tag filter. Low impact (club
   posts store tags '{}', Trending reads tags only), but it is the one publish path without the parity, and a
   later PATCH of such a caption now 422s if the text changes. Owner: A5b/B4 file.
