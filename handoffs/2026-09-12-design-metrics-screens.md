# Metrics screens — what a student sees, and where the money line falls

**Verified against code + the live DB on 2026-09-12.** Every number below is a `count(*)`, not an estimate (`list_tables` reports stale reltuples: it claims 9 profile_views / 30 post_views; the real figures are 25 and 149).

---

## 1. The collection layer, as it actually is

| Signal | Table | Rows | Keeps identity? | Who can read it | Retention |
|---|---|---|---|---|---|
| Profile views | `profile_views` | **25** | Yes — `viewer_user_id`, `viewed_on`, `first_viewed_at`, `referrer` | **Owner only** (`profile_views_owner_select`: `auth.uid() = profile_user_id`) | Since 2026-05-11. 16 of 25 rows older than 90d; 9 in last 30d; 5 in last 7d. No purge. |
| Post views | `post_views` | **149** | Yes — `user_id`, `viewed_on` (**date only, no timestamp**) | **Nobody.** RLS on, **0 SELECT policies** → service role only | Since 2026-05-08. No purge. |
| Likes | `post_likes` | 11 (8 from someone other than the author) | Yes | **Any signed-in user** (`qual = true`) | forever |
| Comments | `post_comments` | 14 (11 from others) | Yes | **Any signed-in user** | forever |
| Reposts | `post_reposts` | 4 | Yes | **Any signed-in user** | forever |
| **Saves** | `bookmarks` | **2** | Yes | **Owner of the bookmark only** (`bookmarks_all_own`) | forever |
| Follows / connections | `connections` | 17 edges (14 sit in reciprocal pairs) | Yes | **Any signed-in user** | forever |
| Message activity | `messages` | 56 | Yes | channel members | forever |
| Major / year | `users` | 6 of 8 have both | — | any signed-in user | — |
| Campus | `users.school` | **1 of 8** | — | any signed-in user | — |
| Search appearances | — | **not instrumented** | — | — | — |

**Denormalized counters:** `users.profile_view_count` sums to 25 — exactly matches the ledger, no drift. `posts.view_count` sums to 149 — matches too, but see §3.

### Questions the data can answer today
- How many people viewed your profile today / 7d / 30d / all-time, **and who**, ordered by `first_viewed_at`, deduped per viewer per day.
- Who viewed each of your posts, and on which date.
- How many likes / comments / reposts / saves each post has, and who.
- Follower / following / connection / "people you both follow" counts and lists.
- Major and year of any of those people → an audience breakdown by major and year is buildable (6 of 8 users have both).

### Questions it cannot answer — do not design screens around these
- **"Where they came from."** `profile_views.referrer` is `document.referrer`, truncated to 80 chars (`src/app/api/profile-views/route.ts:50`). All 24 non-null values are profile pages (`/profile/<handle>` or `/html/profile.html`) because the tracker only runs on the profile page. Zero rows from the map, campus, search or the feed. The plan's differentiator is not in the data.
- **Ordering or time-of-day of post views.** `post_views` PK is `(post_id, user_id, viewed_on)` — a date. There is no "just now", and two viewers on the same day have no order. `profile_views` *does* have `first_viewed_at`, so the profile list can be ordered. Design around the asymmetry.
- **Repeat views.** Dedupe is per-person-per-day by design. "Viewed you 5 times" is unanswerable.
- **Anonymous views.** Both RPCs `RETURN false` when `auth.uid()` is null.
- **Campus breakdown.** 1 of 8 accounts has `school` set. Not shippable.

---

## 2. The finding that changes the plan: the paywall as written cannot be enforced

`pg_policies` for `post_likes`, `post_comments`, `post_reposts`, `connections`, `comment_likes`:

```
cmd = SELECT   roles = {authenticated}   qual = true
```

and `has_column_privilege('authenticated','post_likes','user_id','SELECT')` → **yes** (same for `post_comments.user_id`, `post_reposts.user_id`, `connections.follower_id`).

The product ships a browser-side Supabase client that queries tables directly — `ProfileHandleSwitch.tsx:77-82` does `supabase.from("users").select("handle")` from the browser. So a signed-in student can open devtools and list every liker and commenter on any post, and walk the entire follow graph, without paying and without an API.

Meanwhile:

| Table | RLS | SELECT policies | Reachable by a client? |
|---|---|---|---|
| `post_views` | on | **0** | **No — service role only** |
| `profile_views` | on | 1, owner-only | Only your own incoming views |
| `bookmarks` | on | 1, owner-of-row | Only your own saves |

**Recommendation: draw the paid line on the RLS boundary that already exists — viewers and savers.** "Who liked / who commented" ships free, because it already is free and a student will notice. This is a smaller paid tier than the plan assumed, but it is the only one that is honest, and it maps exactly to the two signals the database already refuses to hand out.

---

## 3. The number on the screen today is wrong

`record_post_view` (`supabase/migrations/20260508110000_post_views.sql`) has no self-view check. `record_profile_view` (`20260513000000_…`) explicitly skips self (`IF v_viewer = p_profile_user_id THEN RETURN false`). The post one was never given the same guard.

Measured, per account, from the ledger:

| handle | views excl. self | views by the author | real distinct viewers |
|---|---|---|---|
| vibecqo | 36 | 6 | 3 |
| james | 21 | 10 | 3 |
| frankycazares | **20** | **54** | 3 |
| henryodie | 1 | 1 | 1 |

`posts.view_count` (which is what `creator-stats` returns as `totals.views`, route line 73, and what `MetricsBlock` prints as "Post views", `OttoSidePanel.tsx:654`) includes all of it. **Franky's screen says 74; the truth is 20.**

Fix forward, don't rewrite history: compute the metrics-screen number from the ledger excluding self, and add the self-guard to the RPC for future rows. Backfilling `posts.view_count` is a production write and should be a deliberate, separate decision.

---

## 4. Collection gaps that make the paid metric blind

**The phone records nothing.** The only writer of `profile_views` is `public/html/profile.html:10003`, gated on `document.body.classList.contains('viewer-mode')` **and** `?handle=`. Desktop `/profile/<handle>` redirects into that page (`ProfileHandleSwitch.tsx:54-58`), so desktop counts. Mobile renders `ProfileMobile` and never calls the endpoint — a repo-wide grep for `profile-views` finds only the GET consumers plus that one POST. Every viewport under 900px, which is the product students actually use, contributes zero rows to the flagship paid metric.

**Blocked people appear in the one screen that shows faces.** `/api/me/profile-views` doesn't call `loadHiddenUsers` (`src/lib/safety/hidden-users.ts`), unlike `/api/feed` and `/api/me/notifications`. Someone you blocked still shows up in "Recent viewers".

**No entitlement exists.** The full `users` column list has no tier/premium/subscription column, and a repo grep for premium/billing/stripe/paywall returns only the hardcoded `premium: false` at `src/app/api/me/profile-views/route.ts:103` and its two readers. Premium needs a new column or table → a migration, applied by hand per the security model.

---

## 5. The screens

Three surfaces already render metrics and all three must stay honest — they are the file-ownership axis for the UI work:
- `src/components/otto/OttoMetrics.tsx` — `/otto?tab=stats`, and the phone's Stats pane via `OttoMobile.tsx:397`
- `src/components/network/OttoSidePanel.tsx:612` — `MetricsBlock`, the compact grid
- `public/html/_otto.js:613-665` — `_ottoFetchMetrics` / `_ottoRenderMetrics`, the static desktop twin

### Screen A — "Your reach" (free, owner-only, `/otto?tab=stats`)

| Row | Source | Empty state (honest — never "0") |
|---|---|---|
| Profile views · today / 7d / 30d / all time | `/api/me/profile-views` counts (exists) | "Nobody's looked yet. Your profile shows up when you post, comment, or turn up on the map." |
| Post views · 7d / 30d / all time, **excluding your own** | `creator-stats`, ledger-derived | "You haven't posted yet — post views land here once you do." |
| Likes · comments · reposts · **saves** | `creator-stats` + new saves count | "No reactions yet." |
| Top posts | `creator-stats.top_posts` (exists) | hidden when there are no posts |
| Teaser: "**N** people looked at your profile this week" + locked *See who* | counts only | **render only when N > 0** — a locked row over nothing is a worse ad than no row |

Failure: keep the current per-block pattern — each half owns its own `LoadFailed` with its own line (`OttoMetrics.tsx:42-43, 151-153`). A refused read must never paint a 0 tile.

### Screen B — "Who viewed you" (paid, owner-only)

Rows: avatar, name, @handle, "Tuesday" (from `first_viewed_at`), and a follow-state action button. Render each row through the existing people-row path so it matches the rest of the app: `hydrateUserCards` → `UserCardData` → `UserCard`.

- Free: the count, plus **the 3 most recent names**, then the lock.
- Paid: the full list, 90 days back, paginated.
- Empty (paid, no views): "No one yet."
- Blocked/muted viewers filtered out via `loadHiddenUsers`.

**This is the one place where shipping premium makes the free product worse.** Today `OttoMetrics.tsx:166` renders up to 8 recent viewer avatars, linked to their profiles, to everyone, under the caption "premium soon — viewer identity will move behind the paywall" (line 190). Gating to 0 is a takeaway from a live surface; gating to 3 keeps a free floor. See decision 2.

### Screen C — "Who saw this post" (paid, owner-only, per post)

Entry point: the post viewer's engagement bar, **owner only**. Rows grouped by date, newest date first, no intra-day order (schema limit — say "Tuesday", never "2 hours ago"). Free users already see the count in the engagement bar; that doesn't change.

### Screen D — "People you both know" (free) — the nearest shippable step

The modal behind the "N mutual" pill. **Free, not paid**: the follow graph is already readable by any signed-in client, so gating it would be theater.

---

## 6. The nearest shippable step, end to end

### The definition problem, first
`getMutualCount` (`src/lib/connections/queries.ts:128-152`) counts *people the target follows who the viewer also follows* — a directed-follow intersection. Everywhere else in the product "mutual" means a reciprocal pair (`getCountsFor`, lines 79-90). Measured for Franky: vs `james` the pill says **2**, strict both-sides-connected is **1**; vs `vibecqo`, 2 vs 1.

The count and the list must come from **one query**, or the pill will say 2 and the modal will show 1 person. Extract `getMutualIds(supabase, viewerId, targetId): Promise<string[]>` and redefine `getMutualCount` as its length. Then label the modal for what the math is: **"People you both follow."**

### `GET /api/users/[handle]/mutuals` (new file)
- 401 when signed out (matches `/api/users/[handle]/connections`), 404 for an unknown handle.
- Block check in both directions before returning any people, same shape as `bootstrap/route.ts:92-109`.
- `?limit` (default 20, max 50) `&offset` `&q=` — the exact contract of `/api/me/followers/route.ts`, returning `{ ok, users, total, has_more }`.
- Ids from `getMutualIds`, hydrated with `hydrateUserCards(supabase, viewer.id, pageIds)`.
- **Cookie client, not service role.** `connections_select_authenticated` is `qual = true`, so RLS cannot zero this. (The comment at `bootstrap/route.ts:186-190` claims RLS could silently zero the count and reaches for the service client — that reasoning is wrong for `connections`; don't copy it into new code.)

### `public/html/profile.html`
- Un-hide the pill (line 3303 carries `style="display:none"`, with the S55 comment above it at 3302).
- Hide it when the count is 0 — a "0 mutual" pill opening an empty modal is exactly what S55 removed.
- Replace the hardcoded modal body (lines 3767-3774, currently a static "No mutual connections yet.") with a real list, reusing `rowHTML` / `metaLine` / `initialsOf` from the connections-modal IIFE (~lines 9690-9730) — `metaLine` already prints "N mutuals".
- Fetch with `window.vibeRequest`, fail with `window.vibeLoadFailed` (`public/html/_persistence.js:255, 346) so a refused load says so instead of reading as "nobody".

### `ProfileMobile`
The phone profile shows only Followers and Connections (`ProfileMobile.tsx:1321-1322`) and has no mutual pill at all — a separate item, different file, parallel-safe.

---

## 7. Privacy — every route that exposes identity, and what holds it

| Route | Exposes | What enforces owner-only |
|---|---|---|
| `GET /api/me/profile-views` (exists) | who viewed **you** | `auth.getUser()` + **RLS** `profile_views_owner_select`. The DB is the boundary; the route can't leak someone else's. Add `loadHiddenUsers` + the entitlement slice. |
| `GET /api/me/posts/[id]/viewers` (**new**) | who viewed **your** post | **The route is the only boundary.** `post_views` has zero policies, so this must use the service client — and therefore must verify `posts.user_id = auth.uid()` *before* touching it. Highest-risk new file in this batch. |
| `GET /api/me/posts/[id]/savers` (**new**) | who saved **your** post | Same shape. `bookmarks` RLS is owner-of-the-bookmark, so a post author cannot read it with the cookie client; ownership check first, service client second. |
| `GET /api/users/[handle]/mutuals` (**new**) | people you both follow | Cookie client, RLS-scoped. No escalation — already public. Block check for safety, not secrecy. |
| `GET /api/me/creator-stats` (exists) | counts only | Already correct; it uses the service client **only** for `post_views` counts over `postIds` derived from the caller's own id (lines 112-120). |

**Rule for this whole batch:** never let a user id that came from a service-role query reach the response without an ownership check earlier in the same function. Every new identity route gets `rateLimit()` (`src/lib/rate-limit.ts:20`) keyed on the caller's user id — these are enumeration surfaces.

**What a viewer learns about someone else does not change anywhere in this plan.** Counts stay public; every new identity list is owner-scoped.