# Critique result: A3 Vibe+ and counts (go-with-changes)

## Recommended approach

The direction is right: remove the owner's direct read of the profile-views ledger, read it on the server after the entitlement check, and stop filtering count-only totals. Four corrections before building (full notes: /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-A3.md).

1. Pure helper first. Create `src/lib/metrics/audience-split.ts` with relative imports only. Do not import "server-only" or `@/` paths, because post-audience.ts has `import "server-only"` and node --test cannot load it. Export `splitAudience(entries, hiddenIds) -> { total, listed }`, where total = entries.length (distinct people, author already excluded) and listed = entries without hidden ids, order kept. Add `audience-split.test.ts` using the dynamic `./audience-split.ts` import pattern from `src/lib/posts/engagement-counts.test.ts:18-20`. The key regression test: `total` is identical for hiddenIds [], [x] and "everyone". That is the mute-and-recount oracle.

2. `src/lib/metrics/post-audience.ts`:
   - `loadPostViewers` (:162-239) returns `{ ok, total, entries }`. total = `lastSeen.size`, taken after the author is excluded and before the hidden filter at :224-228. entries stays filtered.
   - Replace `loadPostSavers` (:320-339) with `countPostSavers({ postId, authorId }) -> { ok: true, total } | { ok: false }`, built on `loadPostSaveRows(...).length`. It takes no hiddenIds parameter, so no caller can put the filter back.
   - Keep the `loadPostSaveRows` signature, because creator-stats imports it.
   - Fix the docblocks at :157-160 and :316-319.

3. `src/app/api/me/posts/[id]/savers/route.ts`:
   - Remove the `loadHiddenUsers` import and call (:5, :69-74).
   - Call `countPostSavers` and return `{ ok, viewer_identities: "private", total }`.
   - Rewrite the header at :32-37. total now equals `counts.saves` from GET /api/posts/[id].

4. `src/app/api/me/posts/[id]/viewers/route.ts`. The plan does not own this file, and it must: this is the "free viewers" half of #18.
   - Resolve `hasPlus` first. On the free branch, skip `loadHiddenUsers` and return `total = audience.total`, which is unfiltered.
   - On the Vibe+ branch, `total = audience.total`, slice `audience.entries`, and set `has_more: offset + pageEntries.length < audience.entries.length` and `next_offset` from the filtered list. Clients page on has_more/next_offset, never on total (PostAudienceList.tsx:186-191, _postViewer.js:2011-2019).
   - Rewrite the docblock at :40-49.

5. `src/lib/metrics/profile-viewers.ts`. Not owned by name; add it.
   - Add `import "server-only"`. This is safe: ProfileViewersList.tsx:9 uses only `import type`.
   - `scanLedger` (:224-265) reads with `createSupabaseServiceClient()`, still `.eq("profile_user_id", userId)`. If `!isSupabaseServiceConfigured()` it returns null (a 500, not zeros).
   - Keep the cookie client for `loadHiddenUsers` and `hydrateUserCards`.
   - total = `seen.size` (unfiltered distinct). `has_more`/`next_offset` come from `people.length` (filtered) at :171 and :202-203.
   - Rewrite :17-22 and :134-136. They currently say RLS is the backstop and that no service role appears in the file.

6. `src/app/api/me/profile-views/route.ts`. Not owned by name; add it.
   - Move the four `profile_views` reads (free `locked_count` :115-120; today/7d/30d head counts :172-186) onto one service client, keyed on the `auth.getUser()` id.
   - `users.profile_view_count` stays on the cookie client.
   - If the service role is not configured, return 500, never zeros.
   - Rewrite :53-55.
   - Build no count RPC: our own route is the only consumer, and an RPC would force the migration to go before the deploy.
   - `src/app/api/me/profile-viewers/route.ts` needs no logic change, because it already calls requirePlus before the loader. Only its comment changes.

7. Migration `supabase/migrations/20260928120000_profile_views_server_only.sql`:
   - PRE-FLIGHT, abort on any drift:
     - relrowsecurity is true.
     - Exactly one policy exists: `profile_views_owner_select`, cmd SELECT, roles {authenticated}, qual `(auth.uid() = profile_user_id)`.
     - has_table_privilege(authenticated/anon, 'public.profile_views', 'SELECT') is true.
     - `record_profile_view` has prosecdef = true and owner postgres.
     - post_views has 0 policies.
     - No view depends on profile_views.
   - CHANGE:
     - `drop policy profile_views_owner_select on public.profile_views;`
     - `revoke select, insert, update, delete on public.profile_views from anon, authenticated;`
     - RLS stays on.
     - Pick drop plus table revoke, not the column revoke the report suggests. authenticated holds table-wide SELECT, so `revoke select (viewer_user_id, referrer)` does nothing (the same trap is written up in `20260927141000_users_platform_admin_flag_server_only.sql:15-16,87-88`).
     - Why revoke on top of the drop: with RLS alone, a future cookie read returns [] and the page says "nobody looked". With the grant gone it fails with 42501, and the route's existing error path returns a 500. That matches the house rule "a refused read never paints a 0".
   - POST-CHECK, by catalog: 0 policies; authenticated and anon SELECT false; service_role SELECT true. No 20260927* migration switches roles inside the file, so don't invent that for prod.
   - ROLLBACK: recreate the policy word for word, plus `grant select, insert, update, delete on public.profile_views to anon, authenticated`.
   - No `_cleanup.sql`: no data changes.

8. Local probes, inside a rolled-back transaction:
   - As blake (authenticated), `select count(*) from public.profile_views` returns only his own rows before the migration and raises 42501 after.
   - service_role still reads.
   - `record_profile_view` as blake viewing casey still returns true.
   - Insert a local mute of a saver or viewer; savers `total` and free viewers `total` are unchanged.
   - As a free user, Otto metrics tiles and `locked_count` match the values from before the change.

9. Order: deploy the code FIRST, apply the migration AFTER Vercel is Ready. This is not "either". The new code works with or without the policy, because it uses the service role. The old code against the new database would show zeros (policy dropped) or 500s (grant revoked). This contradicts the plan's wave footer ("apply in order -> push"), so A3 needs its own apply-after-deploy step.

## Ownership changes

- ADD `src/app/api/me/posts/[id]/viewers/route.ts`. Its free branch returns the hidden-filtered `total` (:121-131), which is the 'free viewers' oracle in #18. It reads post_views with the SERVICE role, so the plan's catch-all ('routes that read identities with the cookie client') misses it.
- ADD `src/lib/metrics/profile-viewers.ts`. `scanLedger` (:236-244) is a cookie-client read of profile_views. It feeds BOTH /api/me/profile-views `recent` and /api/me/profile-viewers, and would silently return an empty paid list once the policy is gone.
- ADD `src/app/api/me/profile-views/route.ts`. Its four cookie-client profile_views reads (:115-120, :172-186) would silently show 0 (policy dropped) or 500 (grant revoked). This is the free tier's tiles, not just Vibe+.
- ADD new `src/lib/metrics/audience-split.ts` + `audience-split.test.ts`, the pure count/list split. post-audience.ts cannot be tested directly because it imports 'server-only'.
- OPTIONAL comment-only lines: `public/html/_postViewer.js:1905-1906` and `src/components/posts/PostAudienceList.tsx:36` both say total excludes blocked/muted people. No wave-A batch owns either file; B3 owns only the composer path of profile.html, not _postViewer.js. Either give A3 these comment lines or leave them stale; there is no behaviour impact.
- NO conflicts with other batches. A2 owns `src/app/api/posts/[id]/route.ts`, whose counts.views/counts.saves are already unfiltered: A3 must not touch it. `src/lib/safety/hidden-users.ts` and `src/lib/connections/queries.ts` (hydrateUserCards) stay unchanged by A3. If A2 hides blocked users in `users` SELECT, hydration drops only people A3's lists already filter out.
- WAVE-LEVEL SEQUENCING CONFLICT: the plan footer says 'apply in order -> push'. A3's migration must be applied AFTER the push/deploy is Ready, so the wave runbook needs a per-batch before/after column.

## Breakage risks

- /api/me/profile-views: all four profile_views reads use the cookie client. After the policy drop, the free tiles and `locked_count` read 0 and the Vibe+ `recent` reads [] ('nobody looked'), with no error. After a SELECT revoke, the route 500s and Otto metrics shows 'Couldn't load your metrics.' in public/html/_otto.js:617-628, OttoMetrics.tsx and OttoSidePanel.tsx. Fix: move every read to the service role keyed on the getUser() id, and deploy BEFORE the migration.
- /api/me/profile-viewers ('Show more'): goes through loadProfileViewers -> scanLedger on the cookie client, with the same silent-empty/500 outcome. Fix: scanLedger uses the service role; the route itself is unchanged.
- The report's suggested column revoke `revoke select (viewer_user_id, referrer) from authenticated` is a NO-OP, because authenticated holds table-wide SELECT on profile_views (verified live: has_table_privilege true, every column selectable by anon and authenticated). A builder who follows the report literally ships a migration that changes nothing. Fix: drop the policy and revoke table-level privileges.
- Viewers route with an unfiltered total but has_more computed from total: 'Show more' would stay on forever when a hidden person is in the audience. Fix: has_more/next_offset must come from the FILTERED entries length. Same for profile-viewers.ts :171/:202-203.
- Moving the pure split into post-audience.ts: node --test cannot import a module with `import "server-only"`, so the test would crash. Keep the helper in its own file with relative imports only.
- Adding `import "server-only"` to profile-viewers.ts is safe only because ProfileViewersList.tsx:9 uses `import type`. Keep it type-only.
- View recording (POST /api/profile-views -> record_profile_view) is safe. It is SECURITY DEFINER, owned by postgres, and is the only database object that references profile_views (pg_depend + prosrc scan: no views, no other functions, no triggers).
- The service role not being configured (a local .env without the key) would make the profile-views counts silently 0 if the builder copies the savers pattern wrong. Return null/500 on `!isSupabaseServiceConfigured()`, exactly as post-audience.ts does.
- Applying the migration before the deploy (as the wave footer implies) opens a window where production shows zeros or 500s on every Otto metrics open. 14 owners are affected, and billing is off, so the harm is small but real. Apply after the deploy is Ready.

## Live facts

- public.profile_views: RLS enabled, not forced. Exactly one policy: `profile_views_owner_select` FOR SELECT TO authenticated USING `(auth.uid() = profile_user_id)`. No INSERT/UPDATE/DELETE policies.
- Grants: anon AND authenticated hold table-level SELECT/INSERT/UPDATE/DELETE on profile_views, post_views and bookmarks (Supabase defaults). No column revokes: every profile_views column (profile_user_id, viewer_user_id, viewed_on, referrer, first_viewed_at) is SELECTable by authenticated and anon.
- profile_views owner: postgres. Only database reader/writer: public.record_profile_view(p_profile_user_id uuid, p_referrer text) SECURITY DEFINER, owner postgres, search_path=public. It inserts ON CONFLICT DO NOTHING and bumps users.profile_view_count. No views depend on profile_views. No triggers on profile_views, post_views, bookmarks, blocks or mutes.
- post_views: RLS on, 0 policies (sound). bookmarks: `bookmarks_all_own` ALL TO authenticated USING (auth.uid() = user_id). mutes/blocks: owner-only policies.
- Counts (prod): profile_views 43 rows across 14 owners; post_views 155; bookmarks 2 across 2 posts; mutes 0; blocks 0; public.entitlements 1 row (the table is `entitlements`, not `user_entitlements`).
- Notification types live: follow 36, like 8, comment 8, mention 7. No save or view notifications, so there is no second channel naming savers or viewers.
- Latest prod migration: 20260927142000_post_media_url_author_folders. Local schema_migrations stops at 20260926100000 (the 20260927* files are not registered locally). Local profile_views has the same single policy, 1 row, owner postgres, so A3's pre-flight matches both.

## Questions for Franky (ruled in waveA-build.md)

- Vibe+ 'N people saw this / viewed you' heading: should it count people you've muted or blocked, even though their names are left out of the list below it? Recommended: yes. The number is the same on free and Vibe+ and never moves when you mute someone, which is what closes the mute-and-recount trick. The list just leaves those names out.
- Before paid Vibe+ turns on, should the privacy page and profile copy tell students that visiting a profile can show their name to that person if they have Vibe+? Recommended: yes, as a Vibe+ launch-checklist item, not part of this security wave. The report notes viewers are named before anything tells them so.

