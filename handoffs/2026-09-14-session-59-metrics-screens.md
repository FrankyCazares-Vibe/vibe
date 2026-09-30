# Session 59 handoff: the metrics screens, end to end (2026-09-14)

Picked up item 2 of the Session 58 list — the metrics screens — and built all four of them on every surface, server first. Continues `handoffs/2026-09-12-session-58-metrics-plus-campuses.md`; Franky's settled answers are in `handoffs/2026-09-12-decisions.md` (do not re-ask). The contracts every batch coded against, plus the orchestrator's calls on the readers' open questions, are in **`handoffs/2026-09-14-wave-plan-metrics-screens.md`** — read it before touching any of these routes.

Item 1 of the S58 list ("apply the two pending migrations") was already done: all four `20260912*` migrations are recorded and verified. **No migration was needed this session.**

## §1 — What shipped (six commits, all pushed and deployed)

| Commit | What |
|---|---|
| `bec4918` | **The paid lists exist on the server.** `GET /api/me/profile-viewers` (Vibe+ only, 403 `plus_required` otherwise) and `recent` on `/api/me/profile-views` share one loader: 90-day UTC window, one row per person (most recent look), blocked/muted removed from the list only, paged by `next_offset` (people consumed, not rows rendered). `GET /api/me/posts/[id]/viewers` and `/savers`: cookie-client ownership check **before** the service-role read; missing and not-yours both 404; author's 71 legacy self-view rows excluded in SQL; free owner gets `{ total }` and no identity key. `GET /api/posts/[id]` adds `is_owner`, `counts.views` (honest ledger), `counts.reposts`, `counts.saves` (omitted when unknown). Creator-stats counts saves (totals, windows, per top post). `plus_required` reads "That's a Vibe+ feature." with a See Vibe+ action in both failure-copy maps. |
| `b4c3deb` | **"N you both follow" opens a real list on desktop.** `getMutualIds` (directed) now backs `getMutualCount`, so the pill and the list are one function; the follow-graph reads page past PostgREST's 1000-row cap. `GET /api/users/[handle]/mutuals` has the followers contract; blocked either way → empty envelope. profile.html's pill is back (visited profiles, count > 0) and opens the connections modal on a fourth tab. The modal's paging cursor for all four tabs now counts ids asked for, not rows rendered. |
| `f218501` | **The Stats screen.** Saves tile; honest empty states; the free teaser ("N people looked at your profile this week" + See who · Vibe+) only when N > 0; Vibe+ gets "Who viewed you" as compact UserCards with UTC day labels and Show more on `next_offset`. Retrying one half no longer resets the other. UserCard says "you both follow". The static Otto panel no longer paints "Profile views 0" when only that half failed. |
| `5f7552f` | **The pill on the phone.** Above the Follow button on visited profiles, count > 0, opening a bottom sheet over the mutuals route with the exported NetworkMobile row; an unfollow inside the sheet moves the pill's number. NetworkMobile's meta line says "you both follow". |
| `c040caf` | **Who saw this post, who saved it.** Views entry in the React viewer (everyone sees the count; the author taps it), the desktop feed's Views chip, and the static twin's viewer — all through one shared `PostAudienceList` that fetches only when opened, groups by day, pages on `next_offset`, and on a free account renders the number, "Vibe+ shows you who." and a See Vibe+ button, nothing else. Ownership is the server's `is_owner`; the ⋯ menu now keys on it too. Saves count beside Save for the author only, hidden at 0 on both twins. |
| `78bc4e5` | honest-views no longer refuses a scan that ends exactly on its cap; the connections modal's four tabs fit one row. |

Gates on every commit: `npx tsc --noEmit` clean, zero NEW eslint problems per file vs HEAD (baseline 89 untouched), `node --check` on every static script including profile.html's six inline blocks.

## §2 — Verified live on production (`78bc4e5`, Franky's free account, gstack browser)

Read-only, from the signed-in page context:

| Check | Result |
|---|---|
| `GET /api/me/profile-views` | keys `ok, counts, premium, viewer_identities, locked_count` — **no `recent` key**; `locked_count: 0`; counts 0/0/0/4 |
| `GET /api/me/profile-viewers` | **403** `{ code: "plus_required", error: "That's a Vibe+ feature" }` |
| `GET /api/me/creator-stats` | `totals.saves`, `by_window.*.saves`, `top_posts[].save_count` present; views 19 (the honest S58 number) |
| `GET /api/me/posts/<own>/viewers` | `{ ok, premium:false, viewer_identities:"locked", total: 4 }` — no `users` |
| `GET /api/me/posts/<own>/savers` | same shape, `total: 0` |
| `GET /api/me/posts/<james's post>/viewers` | **404** `Post not found` (not-owner) |
| `GET /api/me/posts/not-a-uuid/viewers` | **404** (not a 500) |
| `GET /api/posts/<own>` | `is_owner: true`, `counts: { likes 2, comments 1, views 7, reposts 2, saves 0 }` |
| `GET /api/users/james/mutuals` | `total: 2`, 2 UserCardData rows — equals the bootstrap pill count `"2"` |
| `GET /api/users/nobody-here-xyz/mutuals` | **404** `User not found` |

Screens, by screenshot (in the session scratchpad, not committed):
- **Desktop `/otto?tab=stats`**: profile views 0/0/0/4, post views 3/3/19, likes 3 · comments 3 · reposts 2 · **saves 0**, the 7d/30d rows, top posts with a saves figure. No teaser (nobody looked this week) — correct.
- **Phone Stats pane**: same tiles in two columns, saves present.
- **Desktop `/profile/james`**: pill "2 you both follow" beside Message; click → connections modal on "You both follow" with Jamari Shepard and Rylan Conaway. Four tabs on one row after `78bc4e5`.
- **Phone `/profile/james`**: pill above "Connected ✓"; tap → "You both follow" sheet with the same two rows.
- **Phone `/posts/<own>`**: bar shows ♥2 · 💬1 · Repost · 👁7 · Save; no saves count (it is 0). Tap 👁 → sheet "Who saw this — 4 people saw this. Vibe+ shows you who. [See Vibe+]".
- **Desktop `/campus`**: the Views chip on Franky's post (aria "See who saw this — 7 views") → modal with the same lock body, positioned against the viewport.
- **Static twin** (`/profile/frankycazares` → `openPostViewer`): 👁 7 in the bar, saves count hidden at 0, button "Who saw this" enabled → "4 / people saw this / Vibe+ shows you who. [See Vibe+]".

"4 people" vs "7 views" is deliberate: the chip counts viewer-days from the ledger, the sheet counts distinct people. Both routes document it.

## §3 — Not exercised: every paid branch

No account holds an `entitlements` row, so `recent`, `/api/me/profile-viewers`, the paid `users` arrays of the audience routes, and the "Who viewed you" / grouped-by-day lists have only been proven by adversarial review and by the contracts. **Franky's call, not mine** (it is a production write): one comp row lets him see every paid screen before Stripe exists.

```sql
-- Founder comp entitlement (reversible: DELETE FROM public.entitlements WHERE user_id = 'df5ab44e-174f-4c53-a8bc-261c1c67e10b';)
INSERT INTO public.entitlements (user_id, tier, status, source)
VALUES ('df5ab44e-174f-4c53-a8bc-261c1c67e10b', 'plus', 'active', 'comp');
```

Apply with the management-API curl recipe from the migration headers (the MCP is read-only). No `schema_migrations` row — it is data, not schema.

## §4 — Decisions made this session (orchestrator calls, all inside Franky's settled answers)

Full list with reasoning in the wave plan's "Orchestrator decisions" section. The ones that shape the code:
- Zero names free, everywhere — the design doc's "3 most recent names" line is overridden by decisions §4.
- The lock lives on `/otto?tab=stats` (and the phone's Stats pane); the compact grids (`OttoSidePanel` MetricsBlock, `_otto.js`) stay counts-only.
- Hidden (blocked/muted) filtering applies to identity lists only, never to counts — counts must keep matching the denormalized counters.
- Audience routes branch on entitlement (free → 200 with a number), not a blanket 403; not-found and not-owner are both 404.
- Viewer lists dedupe per person; clients page on `next_offset`, never on `users.length` (hydration can drop a deleted/hidden profile).
- Mutuals use the directed math and the words "you both follow"; blocked either way → empty envelope; no hidden filtering (the pill would disagree); the modal reuses the connections IIFE as a fourth tab.
- Saves count is free (creator-stats and `/api/posts/[id]`); the savers list is paid; a 0 saves count shows no affordance.

## §5 — Pick-up list

1. **Stripe.** Checkout, webhook, writing `entitlements` from it. The table, `getEntitlement`/`hasPlus`/`requirePlus`, `/plus`, and every paid screen exist — this is the payment path only. (`provider_ref` is never read today; the webhook writes it.)
2. **Comp row for the founder** (§3) so the paid screens get eyes before Stripe.
3. **Multi-campus** (`2026-09-12-design-multi-campus.md`): unchanged from S58 — strict-equality fixes first, then the campus prompt for the 7 blank accounts.
4. **Deferred hardening**: the world-readable policies on likes, comments, reposts, connections.
5. **Small follow-ups this session left on purpose** (none blocking):
   - `bookmarks` has no index on `post_id`; every saves read filters on it. Trivial migration when rows matter.
   - `/api/me/profile-views` has no `rateLimit` (the new routes all do). Add one when touching it next.
   - `GET /api/posts/[id]` now does two service-role reads (ledger + saves) for every viewer, not just the owner. Fine at pilot scale; cache or scope if it shows up.
   - `getMutualCount` still returns 0 on a refused read, so a failed connections read hides the pill instead of saying so (both twins).
   - Desktop: the pill's number does not refresh after a follow/unfollow in the modal (phone fixes this; desktop re-reads only on reload).
   - Phone: Followers / Connections tiles are still dead taps; only the mutual pill opens a list.
   - `NetworkMobile.tsx:579` "No mutuals yet" (a tab empty state, not the directed number) still uses the old word.
   - The desktop feed chip opens viewers only; "who saved" on desktop is reachable through `/posts/[id]`.
   - `MutualsSheet` imports `NetworkMobile` statically (pulls the network screen into the profile bundle); precedent already existed, flagged only.
   - The React post viewer shows "0" views where the feed card hides the chip at 0; the twins format large counts differently.
   - The connections modal's "You both follow" tab shows to signed-out visitors of `/profile/<handle>`; the route 401s, so it is a dead tab, not a leak.
6. Everything still open from S57 §4 and §6 (phone messaging attachments and Accept/Decline, Block/Mute/Report on the phone's visited profile has since shipped, legal, security-sentinel re-run — **new surface since the last run**: every route in §1).

## §6 — Notes

- **How the session ran.** Eight Opus readers mapped the post-S58 code into `scratchpad/maps.json` before any planning; the wave plan pinned every contract so parallel batches could code against shapes that did not exist yet; two waves (5 + 4 batches), each batch implement → adversarial review → repair, then one integration agent checked every consumer against every producer and ran the gates. 37 subagents, ~4.7M subagent tokens, Fable only orchestrated. The reviewers caught: a paging cursor that walked backwards by one per dropped id, a modal `position: fixed` against a transformed ancestor, a share link that would have painted "0 views", the same unfollow subtracted twice from the pill, a non-UUID post id 500ing where the contract says 404, and the retired "N mutuals" wording resurfacing in three places.
- **Screenshot everything that ships to a phone** — still true; nothing was found this time, but the lock sheet's copy and the bar's spacing were only confirmed by looking.
- **The gstack browser** (`memory/reference_live_verification.md`): never `browse restart`; it loses the signed-in profile. `browse stop` → clear the profile's Singleton locks → `browse connect` → `Mode: headed`. `browse eval <file>` with a promise chain is the way to hit many routes at once.
- **Wave sizing** held at 4–5 batches; the sequenced B7 → B9 dependency (shared list component, then its desktop consumer) worked as a two-stage pipeline item rather than a barrier.
