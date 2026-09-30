# Wave plan — the metrics screens (2026-09-14, session 59)

Source of truth for every implementer and reviewer in this wave. Settled decisions live in
`handoffs/2026-09-12-decisions.md` (do not re-ask). The design is
`handoffs/2026-09-12-design-metrics-screens.md` (its line numbers are pre-wave-A; treat its DB
observations as historical). The current code map, per subsystem, is
`/private/tmp/claude-501/-Users-franciscocazares-vibe/d92ee39b-cd1d-43e7-b737-8c7d71bcfefb/scratchpad/maps.json`
(keys: identity-lock, metrics-ui, creator-stats, connections-lib, profile-static, profile-mobile,
post-viewer, migrations-conventions). Read your batch's map entries before touching code.

## The rules that never bend

1. **Zero names free.** A free account gets counts and a lock. No "3 most recent names" floor — the
   design doc's line about a names floor is overridden by decisions §4 and by what 14af735 shipped.
   No identity string (handle, name, avatar_url) may enter the response, or the process, on a free branch.
2. **Counts are public, identities are private.** Every identity list is owner-scoped; counts stay
   as they are.
3. **A refused read never paints a 0.** Server: unknown → 500, never `[]`/0 as a cover. Client:
   each block owns its own `LoadFailed` / `vibeLoadFailed` and keeps rows it already had.
4. **Service role only after an ownership check in the same function**, and never let an id from a
   service-role query reach the response without that check. Every new identity route calls
   `rateLimit()` keyed on the caller's user id.
5. **The ledger's date is a date.** `post_views.viewed_on` is a DATE: say "Tuesday", never "2 hours
   ago". `profile_views.first_viewed_at` is a timestamp and may be ordered.
6. **Directed math, honest words.** "Mutual" everywhere in this wave means *people you both follow*
   (`getMutualIds`, directed intersection). The pill count and the list must come from the same function.
7. **No commits, no dev server, no prod writes.** Implementers edit only the files their batch owns
   and stop. The orchestrator runs the gates and commits. No migrations are needed this wave.
8. **Lint gate is "no NEW problems vs HEAD" per file**, typecheck is `npx tsc --noEmit` clean, and
   every touched file under `public/html` passes `node --check` (extract inline scripts for .html).
   If `tsc` reports errors only in files another batch owns, say so and move on.

## Orchestrator decisions on the readers' open questions

- Locked teaser prints `locked_count` ("**N people** looked at your profile this week") and renders
  only when `locked_count > 0`. Absent or 0 → no teaser row. It replaces the current italic
  "Vibe+ shows you…" line that keys on `thirty_days > 0`. The teaser says *people*; the tiles say *views*.
- The compact grids (`OttoSidePanel` `MetricsBlock`, `_otto.js` `_ottoRenderMetrics`) are **unchanged**
  this wave. The lock lives on `/otto?tab=stats` (and the phone's Stats pane, which is the same component).
- `plus_required` gets a failure-copy rule (B1) in both `src/lib/feedback/failure-copy.ts` and its
  static twin in `public/html/_persistence.js`: message "That's a Vibe+ feature." with action
  `{ label: "See Vibe+", href: "/plus?next=<current path>" }` — build `next` the way existing rules
  build action hrefs; `/plus` already gates it with `isSafeRelativePath`.
- Screen B gets a paid-only list route (`/api/me/profile-viewers`) **and** `/api/me/profile-views`
  keeps `recent` as the first page from the same loader, so the two never disagree.
- Hidden (blocked/muted) filtering applies to identity **lists** only, never to counts.
- Saves: a free count in `creator-stats` and in `GET /api/posts/[id]`; the savers **list** is paid.
- `/api/me/posts/[id]/viewers` and `/savers` branch on entitlement like profile-views (free → count
  only, 200), not a blanket 403. Not-found and not-owner are both **404**.
- Viewers lists dedupe **per person** (most recent day wins). Author's own historical self-view rows
  are excluded explicitly (`user_id <> posts.user_id`), because 71 pre-guard rows still exist.
- The identity read for post audiences is a **new** helper (`src/lib/metrics/post-audience.ts`);
  `src/lib/posts/honest-views.ts` keeps its "no identity escapes" invariant untouched.
- Mutuals: directed math; blocked in either direction → `200 { ok:true, users:[], total:0, has_more:false }`;
  no hidden-user filtering (no sibling connections route does it, and the pill would disagree);
  `q` filter then count, like the siblings; `rateLimit` only on the new route; self → `[]`.
- UserCard.tsx's "N mutuals" wording becomes "N you both follow" (B4 owns that file).
- Desktop mutuals modal: reuse the connections-modal IIFE as a fourth mode/tab ("You both follow")
  so search, paging, retry and the action buttons come for free; remove the dead `#mutualsModal` shell.
- Phone pill (wave B): above the FollowButton in the visitor CTA block; hidden at 0; Followers/Connections
  taps stay out of scope (follow-up).
- No entitlements row is written for anyone. The paid branches are verified by review and by the
  free-branch contract; a comp row for the founder is a decision for Franky at the end of the session.

## Contracts (wave A builds the server side; wave A/B build the clients)

### C1 — `GET /api/me/profile-views` (B1 modifies, B4 consumes)

Unchanged keys and status codes. Changes, all additive:

- Free (`premium:false`): `{ ok:true, counts:{today,seven_days,thirty_days,all_time}, premium:false,
  viewer_identities:"locked", locked_count?: number }` — as today. No new keys.
- Plus (`premium:true`): `{ ok:true, counts, premium:true, viewer_identities:"visible",
  recent: ViewerRow[], recent_total: number, recent_has_more: boolean }`
  where `ViewerRow = UserCardData & { viewed_on: string /*YYYY-MM-DD*/, first_viewed_at: string /*ISO*/ }`.
  `recent` = the first page (limit 25, offset 0) of the list defined in C2. Existing fields
  `id, handle, name, avatar_url, viewed_on, first_viewed_at` are all still present (superset).
- If the viewer slice fails on the plus branch → 500 (as today). If `loadHiddenUsers` fails → 500.

### C2 — `GET /api/me/profile-viewers?limit&offset` (B1 builds, B4 consumes)

The paid list behind "Who viewed you".

- Order of checks: `auth.getUser()` → 401 `{ok:false,error:"Unauthorized"}`; `rateLimit("profile-viewers:<uid>", {limit:60, windowSec:60})`
  → `tooManyRequests`; `requirePlus(uid)` → 403 `{ ok:false, error:"That's a Vibe+ feature", code:"plus_required" }`.
- `?limit` 1..50 default 25, `?offset` ≥0 default 0 (parse exactly like `/api/me/followers`). No `q`.
- 200 `{ ok:true, users: ViewerRow[], total: number, has_more: boolean }`.
- Definition of the list (one shared loader in `src/lib/metrics/profile-viewers.ts`, used by C1 and C2):
  rows of `profile_views` where `profile_user_id = uid` and `viewed_on >= today-89d` (UTC), scanned with
  the paged `.range()` pattern from `src/lib/posts/honest-views.ts` (pages of 1000, stop on an empty
  page, hard cap 10,000 scanned → return null → route 500), ordered `first_viewed_at desc`; deduped per
  `viewer_user_id` keeping the first (most recent) occurrence; minus `loadHiddenUsers(...).hidden.ids`;
  `total` = that deduped, filtered length; page = slice; hydrate the page's ids with
  `hydrateUserCards(cookieClient, uid, pageIds)` (cookie client is fine — `users` is readable) and attach
  `viewed_on`/`first_viewed_at` from the ledger row. Ids `hydrateUserCards` drops (no visible profile row)
  are dropped from the page; `total` may then overcount by that amount — acceptable, note it in a comment.
  The ledger read may use the cookie client (`profile_views_owner_select` covers it).

### C3 — `GET /api/me/posts/[id]/viewers` and `GET /api/me/posts/[id]/savers` (B2 builds; wave B consumes)

- Order: `auth.getUser()` → 401; `rateLimit("post-audience:<uid>", {limit:60, windowSec:60})`;
  ownership with the **cookie** client: `posts.select("id,user_id").eq("id", id).maybeSingle()` — missing
  row OR `user_id !== uid` → **404** `{ ok:false, error:"Post not found" }`; only then `hasPlus(uid)`.
- `?limit` 1..50 default 25, `?offset` ≥0 default 0. No `q`.
- Free owner: 200 `{ ok:true, premium:false, viewer_identities:"locked", total: number }`. No `users` key.
- Plus owner: 200 `{ ok:true, premium:true, viewer_identities:"visible", users: AudienceRow[], total, has_more }`.
  - viewers: `AudienceRow = UserCardData & { viewed_on: string }`; from `post_views` via the **service**
    client, `post_id = id AND user_id <> post.user_id`, paged scan (pages of 1000, cap 10,000 → 500),
    deduped per `user_id` keeping the max `viewed_on`, ordered `viewed_on desc, user_id asc`, minus hidden ids.
  - savers: `AudienceRow = UserCardData & { saved_at: string }`; from `bookmarks` via the service client,
    `post_id = id`, ordered `created_at desc, id asc`, minus hidden ids. Exclude the author's own bookmark too.
  - `total` (both branches, both routes) = distinct people after the exclusions and the hidden filter.
    Free branch computes it without selecting any identity column beyond the id needed to dedupe/filter
    (ids never leave the function).
- Shared code in `src/lib/metrics/post-audience.ts`: `assertPostOwner(cookieClient, uid, postId)`,
  `loadPostViewers(...)`, `loadPostSavers(...)`. `hydrateUserCards` with the cookie client.

### C4 — `GET /api/posts/[id]` (B2 extends; wave B consumes)

Additive only:
`is_owner: boolean` (top level, `post.user_id === uid`),
`counts.views: number` (honest ledger tally via `loadHonestViewRows`+`tallyViews`; when the helper returns
null fall back to `posts.view_count`, exactly as `/api/feed` does — note in a comment that the fallback
can include self views),
`counts.reposts: number`, `counts.saves: number` (service client `count:"exact", head:true` on `bookmarks`
where `post_id`; on error → omit the key rather than send 0 — document the optionality in the type).
Everything already there stays byte-identical.

### C5 — `GET /api/me/creator-stats` (B2 extends; B4 consumes)

Additive: `totals.saves`, `by_window.seven_days.saves`, `by_window.thirty_days.saves` (bookmarks over the
caller's own post ids, service client, `created_at` windows matching the existing 7d/30d math),
`top_posts[].save_count`. The top-post score is **unchanged** (saves not weighted) so ordering does not
silently shift. A failed bookmarks read → 500 like the other counts (never a 0 tile). Also fix the one
500 that leaks `postsRes.error.message` to say `"Request failed"`.

### C6 — `GET /api/users/[handle]/mutuals?limit&offset&q` (B3 builds; B5 and wave B consume)

Exactly the `/api/me/followers` contract and the `[handle]` additions:
401 first; 400 `Missing handle`; 404 `User not found` (handle lowercased+trimmed); `limit` 1..50 default 20;
`offset` ≥0; `q` trimmed. `rateLimit("mutuals:<uid>", {limit:60, windowSec:60})`.
Block check both directions (copy `bootstrap/route.ts`'s check) → `200 { ok:true, users:[], total:0, has_more:false }`.
Self → same empty envelope. Ids from `getMutualIds(cookieClient, uid, targetId)`; `q` via the same
`ilikeOrFilter(["name","handle"], q)` path the siblings use; `total` after the `q` filter;
`hydrateUserCards(cookieClient, uid, pageIds)`; `{ ok:true, users: UserCardData[], total, has_more }`.

`src/lib/connections/queries.ts`: add `getMutualIds(supabase, viewerId, targetId): Promise<string[]>`
(directed: ids that `targetId` follows and `viewerId` also follows; `[]` for self or on error; deterministic
order — by the connection row's `created_at desc` then id), and redefine `getMutualCount` as
`(await getMutualIds(...)).length`. `bootstrap/route.ts` keeps calling `getMutualCount` unchanged.

### C7 — day labels (B4 builds; wave B reuses)

`src/lib/metrics/day-label.ts` exporting `dayLabelFromTimestamp(iso: string, now?: Date): string`
(local time: "Today", "Yesterday", weekday name for the last 6 days, else "Sep 3" / "Sep 3, 2025" when
another year) and `dayLabelFromDate(yyyyMmDd: string, todayUtc?: string): string` (same words, computed on
UTC calendar dates because `viewed_on` is a UTC date). Pure, no React.

## Batches — wave A (parallel, file-owned)

| Batch | Owns (edit nothing else) | Builds |
|---|---|---|
| **B1 server-profile-viewers** | `src/app/api/me/profile-views/route.ts`, new `src/lib/metrics/profile-viewers.ts`, new `src/app/api/me/profile-viewers/route.ts`, `src/lib/feedback/failure-copy.ts`, `public/html/_persistence.js` (the failure-copy twin only) | C1, C2, the `plus_required` copy rule |
| **B2 server-post-audience** | new `src/lib/metrics/post-audience.ts`, new `src/app/api/me/posts/[id]/viewers/route.ts`, new `src/app/api/me/posts/[id]/savers/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/me/creator-stats/route.ts` | C3, C4, C5 |
| **B3 server-mutuals** | `src/lib/connections/queries.ts`, new `src/app/api/users/[handle]/mutuals/route.ts` | C6 |
| **B4 ui-otto-metrics** | `src/components/otto/OttoMetrics.tsx`, new `src/components/otto/ProfileViewersList.tsx` (optional), `src/components/network/UserCard.tsx` (wording + any prop needed), new `src/lib/metrics/day-label.ts` | Screens A + B against C1/C2/C5/C7 |
| **B5 ui-profile-static-mutuals** | `public/html/profile.html` | Screen D desktop against C6 |

### B4 — what Screen A + B render (OttoMetrics, desktop `/otto?tab=stats` and the phone Stats pane)

- Profile views block: today / 7d / 30d / all-time tiles (as now). Empty state when all four are 0:
  "Nobody's looked yet. Your profile shows up when you post, comment, or turn up on the map."
- Teaser (free, `locked_count > 0` only): "**N people** looked at your profile this week." + link
  "See who · Vibe+" → `/plus?next=/otto?tab=stats` (encode the next value). Otherwise nothing.
- Recent viewers (plus): heading "Who viewed you", rows rendered with `UserCard` (people-row path, so
  follow-state actions work) plus a right-aligned day label from `dayLabelFromTimestamp(first_viewed_at)`.
  Empty: "No one yet." `recent_has_more` → "Show more" that GETs C2 with `offset = rows.length`,
  appends, and on failure renders an inline `LoadFailed` (compact) under the rows it already has.
- Post views: 7d / 30d / all-time (as now). Empty when `totals.posts === 0`: "You haven't posted yet —
  post views land here once you do."
- Reactions row: likes · comments · reposts · **saves** (`totals.saves`; if the key is absent from the
  payload hide the saves tile rather than showing 0). Empty when all are 0: "No reactions yet."
- Top posts (as now) — hidden when there are none; each row links to `/posts/<id>` if it does not already.
- Failure: keep the per-half `LoadFailed` pattern; a refused half never paints a 0 tile.
- Extend the local payload types to the C1/C5 shapes; keep the `vibeRequest` + `quiet` pattern.
- Do not touch `OttoSidePanel.tsx` or `_otto.js`.

### B5 — what Screen D renders (profile.html)

- The pill (`.profile-mutual-pill`, `#statMutual`): drop the inline `display:none`; show only on a visited
  profile (`window.viewingRealUser` non-null) when the hydrated count is > 0; keep it hidden otherwise
  (a "0 you both follow" pill is what S55 removed). Label stays "N you both follow".
- Clicking opens the **connections modal** in a new "You both follow" mode that fetches C6 for
  `viewingRealUser.handle` with the same `limit/offset/q` wiring, the same first-page inline error with
  Retry (`quiet: offset === 0`), the same load-more toast behaviour, and the same `rowHTML/metaLine/actionFor`
  rendering and `handleAction` follow actions. Empty: "No one you both follow yet."
- Remove the dead `#mutualsModal` shell and its three one-liners, or repoint `openMutualsModal()`.
- Data via `window.vibeRequest`; failure via `window.vibeLoadFailure` / `window.vibeLoadFailed`.
- After editing, `node --check` every inline script you touched (extract to a temp file) — the page has
  no build step.

## Wave B (runs after wave A is committed)

| Batch | Owns | Builds |
|---|---|---|
| B6 ui-profile-mobile-mutuals | `src/components/mobile/ProfileMobile.tsx`, `src/components/mobile/NetworkMobile.tsx` (export `UserRow`/`listStyle` only) | Screen D phone: pill above the FollowButton, vaul sheet over C6 |
| B7 ui-post-viewer-react | `src/components/mobile/PostViewerMobile.tsx`, new `src/components/mobile/PostAudienceSheet.tsx` | Screen C: views count (all viewers) + owner-only tap → sheet over C3; saves count for owner; free → lock sheet |
| B8 ui-post-viewer-static | `public/html/_postViewer.js` | Screen C static twin |
| B9 ui-feed-views-chip (optional) | `src/app/campus/campus-home.tsx` FeedRow region only | owner click on the Views chip opens the audience sheet |

## Review checklist (adversarial reviewers, per batch)

Refute first. For every finding give file:line, the concrete input that breaks it, and a severity:
`must-fix` (privacy leak, wrong number, refused read painting a 0, contract mismatch with this doc,
type/lint error), `should-fix`, `nit`. Specifically hunt:
- an identity string entering a free branch (grep the free code path for handle/name/avatar);
- a service-role query before the ownership check, or an id from one reaching the response;
- paging that can silently truncate or double-count; dedupe that drops the wrong row;
- date math off by one (UTC vs local, 90-day window inclusive/exclusive) and "N days" copy vs the actual window;
- the client reading a key this doc does not define, or the server sending one the client needs but omitted;
- a failure branch that renders as "nobody" / 0;
- `banner_gradient` interpolated raw anywhere (it is a preset KEY);
- eslint rules that bite here: `react-hooks/set-state-in-effect`, `react-hooks/refs`, `no-explicit-any`, unused vars.

## As built after wave A (commits bec4918, b4c3deb, f218501) — wave B codes against THIS

- C1 plus branch additionally sends `recent_next_offset: number`. C2 additionally sends `next_offset: number`.
- C3 plus branch additionally sends `next_offset: number` (people consumed). **Clients page on `next_offset`,
  never on `users.length`.** Free branch: `{ ok, premium:false, viewer_identities:"locked", total }` exactly.
  viewers rows: `UserCardData & { viewed_on }`; savers rows: `UserCardData & { saved_at }`.
- C4: `GET /api/posts/[id]` sends `is_owner: boolean` and `counts: { likes, comments, views, reposts, saves? }`
  (`saves` omitted when the count could not be read — treat absent as "unknown", never 0).
- C6 is exactly as specified. Read the real files before consuming them:
  `src/app/api/me/posts/[id]/viewers/route.ts`, `.../savers/route.ts`, `src/app/api/posts/[id]/route.ts`,
  `src/app/api/users/[handle]/mutuals/route.ts`, `src/lib/metrics/day-label.ts` (dayLabelFromDate for
  `viewed_on`, dayLabelFromTimestamp for `saved_at`).
- The phone people row: `UserRow`, `listStyle` and the `ListUser` type are exported from
  `src/components/mobile/NetworkMobile.tsx` (orchestrator edit before wave B). Import them; do not edit that file.
- Free-tier rule for Screen C is the same as everywhere: the count is free, zero names free.
  A free owner tapping "N people saw this" gets a lock sheet: the number, "Vibe+ shows you who.", and a
  "See Vibe+" link to `/plus?next=<current path>` — nothing else.
