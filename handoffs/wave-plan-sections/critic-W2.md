## Critic additions — Wave 2 (§7: F2, F3, F4, E1, F6) + gates G1/G2

Reviewed at HEAD `15062bd` against the wave 1 code on disk. Read-only SQL: max migration `20260916120000`, `posts.edited_at` absent, 0 club posts, 1 visible org, no edge functions, the only DB function writing posts is `record_post_view` (SECURITY DEFINER). `list_branches` → `[]`.

What held up (verified, no action): every W2 import exists with the cited name and shape (`loadViewerFollowedOrgIds → {ok, ids}`, `loadViewerFollow → {ok, row}`, `loadFollowerCount → number|null`, `publicFollowerCount`, `flattenCountEmbed`, `OrgFollowState`, `decodeFollowCursor`/`encodeFollowCursor`/`followKeysetOrFilter(column, c)`, `loadVisibleOrgCards → {ok, byId}` with `OrgCard` keys `id,handle,name,logo_url,verified,is_public`, `extractPostTags`/`checkPostEdit`/`addedHandles`, `OrgJoinControl{relation,variant,axis,source,pendingInviteId,replay,onChange}`, `OrgInviteSheet{handle,orgName,audience,presentation,onClose}`, `OrgInviteBanner{orgName,inviterFirstName,expiresAt}`, and every join-copy helper F6 names). No file has two W2 owners, and no W2 batch imports a module built in W2 (F6 → F3 is by URL only). The sheet reads `users[].follows_since` and `next_cursor`, both of which F3 supplies. The F6 strings in §7 and §11 W2 match `ORG_COPY` exactly. 45 of 52 anchors spot-checked are exact at HEAD (orgs/route.ts :134, :175-231, :241-257, :350-352, :365-368, :391-446, :426, :461; [slug]/route.ts :210, :246, :253, :266, :272-284, :292; profile/route.ts :73, :101, :108, :149, :167, :169; invite-candidates :141-144, :147-149, :152-156, :158-166, :212, :241-261, :263-275, :310-375; feed :153-162, :210, :221, :240, :254, :294-295, :345, :352, :401, :417; community-scope :294, :334, :358, :369-372, :485; posts/[id] :272-280, :338-350; me/posts :38; users/[handle]/posts :81; helpers.ts :81; publish-post :83-87; join-state :236; UserCard :27). The org page anchors are stale by 8–22 lines (Low 1).

### Blockers

None found.

### High

**H-1. Every "branch/local (§11.2 seed)" acceptance item in W2 can't run: no Supabase branch exists and there's no Docker for a local stack.**
- Evidence: `mcp__supabase__list_branches` → `{"branches":[]}`. `which docker` → `docker not found` (`supabase` CLI is installed, but `supabase start` needs Docker). §11.2 says "Build it on a Supabase branch or a local stack … Never on production", and §12 has no step that creates either.
- Unrunnable today:
  - F3: forced `loadHiddenUsers` failure, blocked follower absent, follow-then-join absent, 45-row shared-timestamp paging, unfollow/refollow order.
  - F4: off-campus follower sees the club post, hidden club → `org:null`, forced `loadVisibleOrgCards` failure → 500.
  - E1: the whole PATCH matrix, 31st PATCH → 429, mention-once, the PostgREST column-lock probe, draft publish fan-out.
  - F6: the `invited` / `can_join` / `member` headers at 375 and 1280.
  - Nearly all of these are the positive paths. The rest of W2's evidence is `tsc` plus prod GETs with 0 club posts, 0 follows and 0 edits.
- Fix:
  - Add a §12 step "S-env" before W2 implementation, with two options: Franky says yes to creating a Supabase branch (a paid resource, so it needs his explicit yes; apply all migrations through `20260916130000` there), or Franky installs Docker Desktop for `supabase start`.
  - Until one exists, each W2 batch marks those lines `DEFERRED (no seed env)` in its report instead of claiming them.
  - The orchestrator must not treat W2 as accepted on `tsc` + prod GETs alone.
  - Where a pure test can stand in today, require it:
    - F3: give it a new owned pure file `src/lib/orgs/invite-followers-page.ts` (+ `.test.ts`, no `server-only`) with `followersPage(rawRows, keep: (row) => boolean, max = 20, fetched = 30) → {emitted, nextCursor}`. Test the 45-row shared-timestamp walk and the M-2 cursor rule there.
    - F4: the lane cases in `community-scope.test.ts` already cover what can be tested without a database.
    - E1 and F6 positive paths have no pure stand-in. They stay deferred until S-env exists, or become Franky's §12 S4 by hand.

### Medium/Low

**M-1. E1 keeps "Status logic unchanged", but the E0 trigger now refuses any status change on a published post. So `PATCH {status:"draft"}` on a published post becomes a 500, which E0 told E1 to prevent.**
- Evidence:
  - The migration's `posts_stamp_edited`: `if old.status = 'published' and new.status is distinct from old.status then raise exception 'published posts cannot return to draft' using errcode = '42501'`.
  - Its header says "Batch E1 should reject status "draft" on a published post with a 4xx before its UPDATE, so the route never reaches that 500".
  - §7 E1 step 8 says "Status logic unchanged (:338-350)". At HEAD, `posts/[id]/route.ts:338-350` accepts `"draft"` and sets `patch.status`. Step 10's update error → 500 "Request failed".
- Fix: add E1 step 8a. If `body.status === "draft" && prior.status === "published"`, return 400 `{ok:false, error:"A published post can't go back to draft.", code:"already_published"}` before the update. Add an acceptance line (branch): `PATCH {status:"draft"}` on a published post → 400, row unchanged, no mention sent.

**M-2. F3's `next_cursor` rule is ambiguous and, read literally, skips followers.**
- Evidence: §7 F3 step 5 says "output stopped at 20 → the cursor of the last follow row read". The route fetches `MAX_RESULTS + FILTER_HEADROOM` = 30 raw rows (`invite-candidates/route.ts:58`, `:65`). If "read" means fetched, rows 21–30 that survived the filter are never shown: the next page starts after row 30. The sheet dedupes by id but can't recover skipped rows (`OrgInviteSheet.tsx` `loadMore`).
- Fix: replace step 5 with:
  - If `emitted.length === MAX_RESULTS`, then `next_cursor = encodeFollowCursor(k.first_followed_at, k.id)`, where `k` is the raw follow row that produced the 20th emitted user.
  - Else, if `raw.length === MAX_RESULTS + FILTER_HEADROOM`, the cursor of `raw.at(-1)`.
  - Else null.
  - The 45-row acceptance must assert no gap as well as no duplicate: the union of pages equals the seeded set minus members, blocked and hidden.

**M-3. G1's checklist doesn't prove that publishing still works under the new INSERT lock, or that PostgREST reloaded before W2 pushes.**
- Evidence:
  - E0 locks INSERT: `revoke insert on public.posts from anon, authenticated; grant insert (user_id, type, content, tags, media_url, media_thumbnail_url, status)`.
  - The §11 W1 "Gate G1" bullets check only UPDATE privileges, the trigger, `/api/feed` 200 and a view bump. They never check post-check `b2` (INSERT columns) or a real publish. The migration's own G1 regression also lists only feed + view.
  - The phone and desktop composers both insert through the USER client (`publish-post/route.ts:176-186`). A mistake there breaks the app's core write, and nothing in G1 would catch it before students do.
  - `notify pgrst` is asynchronous, and W2's selects of `edited_at` 500 (PGRST/42703) if PostgREST still holds the old schema.
- Fix: add three steps to G1 in §4.3 and §11:
  - (a) Run migration post-check `b2` → `content,media_thumbnail_url,media_url,status,tags,type,user_id | 0`.
  - (b) Before the W2 push, a read-only schema probe with the public anon key: `curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/posts?select=id,edited_at&limit=1" -H "apikey: <anon>"` → `200` (not `400`). The anon key is already in the client bundle; don't read `.env` for it, take it from the deployed JS or from Franky.
  - (c) Franky publishes one real post from the phone composer right after apply. It is real content, so it can be S3's club post's personal twin or skipped if he prefers. If he declines, record "publish regression unverified" as a known risk.

**M-4. G2 doesn't gate on E1 or F4, but W3 depends on both.**
- Evidence:
  - §4.3 G2 checks only a hidden-club follow 404 and `org_follow_state` on discover rows. Both are F1/F2.
  - W3's E2 and CH1 call `PATCH /api/posts/[id]` and read `edited_at` from `/api/posts/[id]` and `/api/feed` (§5: "E2 … depends on E0 (lib), E1"; "CH1 … E1, F4").
  - A W2 deploy with a broken feed select could still pass G2.
- Fix: add to G2: `/api/feed?limit=20` → 200, every `post` has an `edited_at` key; `/api/posts/<Franky's post id>` → 200 with `post.edited_at`; and the unauthenticated PATCH probe → 401 (§11 W2 items 4–5). Or say explicitly that G2 is "§11 W2 items 1–7 all pass".

**M-5. The §5 matrix gives F6 `channels/route.ts`, but the F6 section says it doesn't own it.**
- Evidence: §5 row F6 lists "`src/app/api/orgs/[slug]/channels/route.ts`". §7 F6 says "(`channels/route.ts` is NOT owned here…)" and "Do not touch: … `channels/route.ts`". §4.1 rule 1 says "The ownership matrix in §5 is authoritative".
- Fix: remove `channels/route.ts` from F6's row in §5.

**M-6. F4 can send up to 1,000 uuids in one `.in("id", …)` URL.**
- Evidence: `loadViewerFollowedOrgIds` defaults to `.limit(opts?.limit ?? 1000)` (`following.ts:239`). F4 step 2 calls `loadVisibleOrgCards(service, ids)` on all of them before capping at 50. The route's own budget note puts 300 uuids at about 11.1 KB, so 1,000 is about 37 KB, and a URL rejected at that size 500s the whole feed.
- Fix: F4 step 1 calls `loadViewerFollowedOrgIds(supabase, user.id, { limit: 200 })`. Step 2 keeps the visible filter, then the 50 cap. The truncation log fires when `ids.length === 200` or `followedOrgIds.length > 50`.

**Low 1. F6's `page.tsx` anchors are from `f23bc5d`, and H1 has since moved them.**
- Evidence (at f23bc5d → at HEAD):

  | What | f23bc5d | HEAD |
  |---|---|---|
  | `type OrgProfile` | :39 | :47 |
  | member count read | :96 | :106 |
  | `member_count` | :127 | :137 |
  | `<OrgProfileAdminBar` | :198 | :220 |
  | `<Header org` | :207 | :229 |
  | `PrivateOrgNotice` | :220 / :587 | :242 / :609 |
  | `<ChannelsSection` | :246 | :268 |
  | handle line | :487 | :509 |
  | `FactsSection` | :828 | :850 |

  Rule 6 covers this, but F6's text says "(:39-54)", "(:197-204)" etc. without flagging them.
- Fix: F6 re-greps by name. Chips are now `:477-483`, and the "Visibility" fact is `:854`.

**Low 2. F2 `[slug]` GET: a failed follow read answers 500 before the hidden-club 404, so a non-member can tell a hidden club from a missing handle during a DB error.**
- Evidence: F2 says the Promise.all at `:246` gains `loadViewerFollow` + `loadFollowerCount`, with "A failed follow read → 500 `load_failed`, the same rule as `ctx.ok` at :253-257". That 500 fires ahead of `if (decision.state === "not_found")` (`:266`).
- Fix: check `!followRes.ok` only after the `not_found` return. The reads can stay parallel.

**Low 3. F4 still sends a hidden club's `org_id` to clients.**
- Evidence: `renderPost` spreads `...withPostMediaUrls(row)` (`feed/route.ts:358`), and `withPostMediaUrls` copies every key (`post-media-url.ts:55`). `PostRow` keeps `org_id`. F4 sets `org:null` for a hidden club but leaves `post.org_id` as the club's uuid. It isn't a name, but it's a stable identifier of a club that "does not exist" to that viewer.
- Fix: in `renderPost`, `org_id: card ? row.org_id : null`. Add an acceptance line: a hidden-club post has `org_id:null` and `org:null`.

**Low 4. F2 `filter=following` edge shapes are underspecified.**
- Evidence:
  - `has_more` is computed on `CAP+1` ids before `.is("hidden_at", null)`, so hidden follows can make `has_more:true` with fewer than 100 rows.
  - The discover early returns (`emptyList`, `:333-341`) close over `campusScope`, which the following branch doesn't define.
  - The "No ids → 200 `orgs: []`" line omits `has_more`, `viewerCampus` and the other fields.
  - The `me` read error at `:145-156` only 500s `if (filter === "discover")`.
- Fix: say it explicitly:
  - every following response (empty, `q` with a null `ilikeOrFilter`, normal) carries `{ok, orgs, has_more, viewerCampus, viewerCampusId, viewerSystem, campusScope: ALL_CAMPUSES}`;
  - the `meErr` condition becomes `filter !== "mine"`;
  - `has_more` means "more follow rows exist", not "more visible clubs".

**Low 5. F3's early returns and search-mode shape.**
- Evidence: the route has three `users: []` returns (`:159-166`, which F3 replaces, plus `:170-177` and `:219-226`). The contract gives only the final 200 shape `source`/`next_cursor`.
- Fix: every 200 from the route, including `:170-177` and `:219-226`, carries `source` and `next_cursor:null`.
- Also say whether followers mode calls `expireStaleInvites` (`:238`, a service-role UPDATE on a GET). It isn't needed, because `inviteIsLive(f, now)` reads the clock (`:330`). Leaving it out keeps the sheet's default open write-free on prod (the §11.0 fingerprint doesn't cover `org_invites.status`).

**Low 6. F6's `is_public` grep acceptance can't pass as worded.**
- Evidence: `generateMetadata` has two hits, the select at `page.tsx:79` and the fallback at `:89`, and `join-button.tsx:53` has a comment hit that F6 replaces.
- Fix: "→ exactly the two `generateMetadata` lines (select + description fallback)".

**Low 7. §12 S0's criteria for B leave out the fact F3's followers list filters on.**
- Evidence: followers mode keeps only `isDiscoverableAccount(row) && !isTriggerDefaultHandle(row.handle)` (F3 step 3). `isDiscoverableAccount` = `school_verified` AND non-empty `otto_answers` (`community-scope.ts:95-99`, `post-login.ts:7-10`). S0 lists four facts and not onboarding. Read-only SQL shows `ec07943e` does qualify (verified, onboarded, non-default handle).
- Fix: add "Otto onboarding complete, handle not the `u<32hex>` default" to S0. Otherwise §11 W2 item 3's "exactly one user, B" and S2's "invite B from Followers" silently find nobody.

**Low 8. E1 adds `edited_at` to three read routes, but other own-post surfaces never get it.**
- Evidence: posts are also read by `orgs/[handle]/page.tsx:187` and `api/orgs/[slug]/profile/route.ts:118` (club posts on the org page), `api/me/threads/[id]/messages/route.ts:446` (shared posts in DMs) and `src/app/posts/[id]/page.tsx:36,:114`. None of these is an Edit surface in the founder decision, so this isn't a break: an edited club or shared post just shows no " · Edited" there.
- Fix: record it as a known gap in E1's docblock, or add `edited_at` to the org page posts select in F6. F6 owns `page.tsx` and it's one column.

**Low 9. Parallel batches share one `tsc`.**
- Evidence: §4.1 rule 3 requires `npx tsc --noEmit` exit 0 per batch. F4 changes exported signatures in `community-scope.ts`, which `invite-candidates/route.ts` (F3) and `orgs/route.ts` (F2) import. A half-edited F4 fails F2/F3's check in a shared working tree.
- Fix: batches run in separate worktrees, or the per-batch check is "no tsc errors in owned files", with a whole-tree `tsc` once after the wave's repair pass.
