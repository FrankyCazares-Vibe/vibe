# Notes P1b — PATCH tag parity, restore into a deleted club, RollingStrip comment (2026-09-28)

Owns: src/app/api/posts/[id]/route.ts (PATCH hunk), src/app/api/admin/content/remove/route.ts,
src/app/api/admin/content/restore/route.ts, src/components/campus/RollingStrip.tsx (comment line only).

## Progress
- Started. Read crosscheck-waveB RESULT, waveB-build, notes-B2 + review-B2-breakage/bypass (F4/F5/S5), notes-P1.
- DONE (1) PATCH tag parity. New pure helper src/lib/posts/post-tag-filter.ts `firstBlockedPostTag(storedTags, content)` =
  `firstBlockedTag([...storedTags, ...captionHashtags(content)])` (publish-post's exact expression; publish left inline, not my
  file). Route PATCH: `firstBlockedPostTag(patch.tags, c.content)` (import swapped from tags.firstBlockedTag; docblock updated).
  New test post-tag-filter.test.ts 6/6: 11th `_`-glued term, `#café_<term>`, 30a_<term> over-32 (every list term), edit==publish
  parity, ordinary captions pass + stored tags valid. Each positive also asserts the OLD filter (stored tags only) missed it.
- DONE (2) remove route: posts read org_id; post log meta gains `org_id` (club or null; posts only). Docblock "A CLUB POST'S CLUB".
  actions.ts removeContent NOT changed (not my file; 0 callers) -> noted in the route comment + follow-up.
- DONE (2) restore route: posts read org_id; in the removed branch, BEFORE the update, clubDeletedSinceRemoval(): org_id set ->
  false; else read ALL post_remove rows for the post with meta->>org_id not null, isUuid + lower, orgs .in(); any gone -> 409
  club_deleted "This club was deleted, so the post can't be put back."; read error -> 500 request_failed (fail closed, nothing
  changed); no org named (personal / old row) -> as before. Live-post retry branch untouched. Docblock + RESPONSES + ORDER.
- DONE (3) RollingStrip.tsx comment: "1 post this week" -> "1 person this week" (tagChipTitle says person/people).
- Next: tsc, tests, local probe of the restore query chain (PostgREST json-path filter) + SQL simulation.
- ADDED (2) restore race: the update is compare-and-set on org_id (club seen -> .eq(org_id), none -> .is(null)); 0 rows on a post ->
  re-read: still removed -> 409 club_deleted (no media release); now live (another admin) -> as before; read error -> 500.
- PROBES (local only): PostgREST chain `.not("meta->>org_id","is",null)` via supabase-js + local service key (supabase status):
  parses; 0 rows on the existing old-style row, 1 with the same shape on author_id (positive). SQL sim (scratchpad p1b/sim.sql,
  rolled back): A club post removed + new meta -> not refused while club lives; service_role deletes the club -> trigger detaches
  -> refused; a later null-org re-remove row -> still refused; B personal + old meta -> restores; C live club -> restores; CAS:
  detached A 0 rows + still removed, B and C 1 row. State after: org back, 0 sim posts, 3 log rows (unchanged).
- GATES: node --test post-tag-filter + caption-tags + tags + edit + rolling-strip-view 52/52; npm test 1253/1254 (known
  parse-reminder only); eslint clean on the 6 touched files; tsc clean on my files (see final line).
- FINAL: tsc exit 0 (whole project, after another builder's reports-client.tsx edit settled); eslint clean. Nothing committed/pushed; no prod access.
