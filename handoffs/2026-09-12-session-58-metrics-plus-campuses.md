# Session 58 handoff: metrics honesty, Vibe+ plumbing, and the campus plan (2026-09-12)

Franky asked for three things — metrics, a paywall with heavy customization ("like Snapchat+"), and full multi-campus. A four-part read-only design pass ran first; he answered the four load-bearing questions; wave A shipped the honesty fixes and the Vibe+ plumbing. **Multi-campus and Stripe are designed but not built.**

Continues `handoffs/2026-09-11-session-57-dm-media-silent-failures.md`, which is still the source for everything shipped yesterday.

## §1 — The design pass (read-only, 4 agents)

Docs, each with file:line evidence and measured SQL:
- `handoffs/2026-09-12-design-metrics-screens.md`
- `handoffs/2026-09-12-design-paywall-monetization.md`
- `handoffs/2026-09-12-design-customization-catalog.md`
- `handoffs/2026-09-12-design-multi-campus.md`

**Franky's answers are in `handoffs/2026-09-12-decisions.md`. Settled — do not re-ask.** In short: the paid line is what the database already protects (profile views, post views, saves); $3.99/month or $24.99/year through Stripe, Apple later; visiting another campus means read everything plus RSVP and request-to-join; and ship the honest lock before payments exist.

**The finding that changed the plan:** "who liked / who commented" cannot be sold. `post_likes`, `post_comments`, `post_reposts`, `connections` and `comment_likes` all carry `SELECT TO authenticated USING (true)`, `authenticated` holds SELECT on their identity columns, and the app ships a browser Supabase client that queries tables directly. Any signed-in student can already read them from devtools. Locking those policies down is a real option but is its own hardening pass — **deferred, not rejected.**

## §2 — What shipped (wave A, 4 batches, each adversarially reviewed)

| Commit | What |
|---|---|
| `b3f23df` | **Post views stop counting the author.** `record_post_view` never got the self-view guard `record_profile_view` has: 71 of 149 ledger rows are authors refreshing their own posts, 54 of them Franky's. Every read path now counts from the ledger excluding the author, through one paged helper. `posts.view_count` is left alone and nothing displays it any more. |
| `1b4dc62` | **A profile setting was an IP beacon.** `users.banner_gradient` was free-text CSS a student could write straight through PostgREST, bypassing the route validator, rendered raw as a CSS background at six sites including other students' screens, with no CSP. It is now a validated preset key resolved from a fixed table. `avatar_url` and `banner_url` were the same hole without needing CSS; both are now pinned to our own Supabase host on write. |
| `14af735` | **Viewer identities went behind Vibe+, honestly.** A free account gets exact counts and no identities — the response has no viewer key at all and the free branch never joins `users`, so no name enters the process. One server-side helper owns the check. `/plus` states what's included, the price, and that it isn't purchasable yet. |
| `7f31f66` | **"N mutual" says what it means** ("you both follow" — the math was never strict mutuals: 2 versus 1 against @james), and **phones record profile views** at last; the whole 25-row ledger was desktop-only. |

**Numbers after the view fix**, measured: frankycazares all-time 70 → 19, 7d and 30d both **0** — every view on his posts last month was his own. That 0 is honest and the screens render it as a real zero state.

## §3 — Migrations

| Migration | State |
|---|---|
| `20260912100500_post_views_self_guard` | **APPLIED + recorded.** Verified: `record_post_view` now carries the guard. |
| `20260912101000_entitlements` | **APPLIED + recorded.** Verified: `public.entitlements` exists. |
| `20260912100000_users_banner_gradient_preset_lock` | **APPLIED + recorded**, after the deploy went live as its header required. Verified: `users_banner_gradient_preset_check` exists. |
| `20260912102000_users_media_url_host_lock` | **APPLIED + recorded**, same ordering. Verified below. |

**All four are applied and recorded.** Verified live afterwards:
- `has_column_privilege('authenticated', …, 'UPDATE')` is now **false** for `banner_gradient`, `avatar_url` and `banner_url` — the database is the boundary, not the route.
- The one live gradient survived the migration as a key (`tyler` → `ember-night`); nothing was silently dropped.
- `record_post_view` carries the self-view guard; `public.entitlements` exists.

**The identity lock, verified on production** with the founder's own (free) account: `/api/me/profile-views` returns `ok`, `counts`, `premium`, `viewer_identities`, `locked_count` — and **no viewer key at all**. No handle or avatar string appears anywhere in the body. The names never leave the server, rather than being hidden by the client.

## §4 — Pick-up list

1. **Apply the two pending migrations** once the deploy is confirmed live, and verify with the SQL in their headers.
2. **The metrics screens themselves.** Wave A made the numbers honest and locked the identities; the screens the design specifies (who viewed, who saved, the people-you-both-follow list behind the pill) are not built. Start there — it is the paid tier's whole value.
3. **Stripe.** Checkout, webhook, and writing `entitlements` from it. The table, the helper and the upgrade page already exist, so this is the payment path only. Apple IAP comes when an iOS app exists.
4. **The customization catalog** (`-design-customization-catalog.md`): 16 customizations already ship and all are free. The cheapest paid tier is a gate, not a build — but the preset-key model from `1b4dc62` is the pattern every new one must follow.
5. **Multi-campus** (`-design-multi-campus.md`): a real `campuses` table, `/campus/<slug>` routing, per-campus feed/orgs/events/map, global connections and search. Ship the two strict-equality fixes (`trending/hashtags/route.ts:57`, `search/route.ts:265`) and the campus prompt for the 7 blank accounts first.
6. **Deferred hardening:** the world-readable policies on likes, comments, reposts and connections.
7. Everything still open from S57 §4 and §6.

## §5 — Notes

- **Screenshot anything that ships to a phone.** Two real bugs yesterday were invisible in code and obvious in a screenshot, and a third (the tab bar covering sheet rows) was found the same way.
- **Wave sizing:** 4–5 file-owned batches, implement → adversarial review → repair. Memory: `feedback_workflow_waves`.
- **Live verification recipe:** memory `reference_live_verification` — simulate refusals with an in-page fetch override; never write to prod.
- The reviewers again earned their keep: they caught the lock shipping half-applied (the server stopped sending names while the only client still required them, which would have broken the panel for every account), an unpaged ledger read that could silently truncate, and an open-redirect in the `/plus` back link.
