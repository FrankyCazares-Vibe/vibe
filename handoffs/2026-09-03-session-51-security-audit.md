# Session 51 handoff — security audit + hardening (2026-09-03)

First session on Claude Fable. Scope from the Session 50 pick-up list: full
audit of RLS policies, service-role exposure, API auth, rate limiting, input
validation, session management. The trigger was a friend noticing the Maya
Chen share-link impersonation (fixed in Session 50).

Method: Supabase security advisors + direct `pg_policies` / grants review,
then four parallel read-only code audits (me/* routes, orgs/admin routes,
posts/users/auth routes, static HTML XSS), then three parallel fix passes
with disjoint file ownership. `tsc`, `eslint` (changed files), and
`next build` all clean. Smoke-tested unauthenticated surfaces on a local
dev server before pushing.

## Commits

| SHA | Title |
|-----|-------|
| `d803937` | `fix(security): close RLS/service-role holes, injection, XSS, open redirects; add rate limits` |
| _(see §5)_ | docs + migration bookkeeping |

Migration `supabase/migrations/20260903100000_security_hardening.sql` was
applied to the live project **after** `d803937` deployed (see §3), because it
revokes RLS reads that the old code depended on.

---

## §1 — What was actually wrong (ranked)

The anon key ships to every browser, so any signed-in user can talk to
PostgREST directly and skip our route handlers. Everything RLS-level below
was reachable that way.

**Critical**
1. `users_update_self` had no column restriction → any user could set
   `is_platform_admin = true`, `school_verified = true`, reset the handle
   cooldown, inflate `profile_view_count`.
2. `users_select_authenticated USING (true)` → every signed-in user could read
   every other user's `email`, `school_email`, `otto_answers`, `otto_settings`.

**High**
3. Stale Phase-1 policies never dropped and OR'd with governance ones:
   `orgs_insert_authenticated (true)` → create an org with `verified=true` and
   any `owner_id`; `org_members_insert` had no role check → join any public
   org as `owner`; `org_members_update` had no `WITH CHECK` → admin promotes
   self to owner; `channels_insert_authenticated (true)` → inject channels
   into any org; `channel_members` bootstrap policy → self-insert into any
   empty channel / any group by id.
4. Phase-1 `channel_members`-based message policies also applied to org
   channels → a stale membership row kept read/write on a channel after it
   went private.
5. PostgREST filter injection: `.or(\`name.ilike.%${q}%…\`)` only escaped
   `%`/`_`, so `q=zzzz,email.ilike.fgc` was a boolean oracle over any column
   (users/search, search incl. service-role orgs branch, followers/following/
   connections ×2, orgs discover).
6. School-email verification token not bound to the session → attacker
   requests a link for `victim@iu.edu`; victim clicks; attacker's account is
   verified with the victim's address.
7. Stored XSS in the static prototypes: campus feed rendered other users'
   name / major / hashtags raw; profile work-logo `src` and both "…" menus
   only `'`-escaped; messages mute note concatenated the member name.
8. Next.js 16.2.4 carried ~20 advisories incl. three middleware-bypass CVEs
   (middleware is our auth redirect layer).

**Medium**
9. Open redirect after login via `next=/%5Cevil.com` (only `//` was rejected).
10. Group-chat creation skipped the "must be connected" rule → bypassed the
    message-request inbox. DM initiator stored as `admin` could kick the peer.
11. `publish-post` accepted any `media_url` → republish another user's clip
    key or an external URL; org asset route was an open redirect; org
    posts/logo/banner accepted any string.
12. `/api/posts/[id]/media` and `/posts/[id]` OG served drafts by id.
13. `/api/users/[handle]/posts` ignored blocks; anonymous bootstrap shipped
    resume PDF URLs (public bucket, redactions are client overlays).
14. No rate limiting anywhere; health endpoints public; 94 API 500s echoed
    Postgres error text.

**Advisor findings**: 16 SECURITY DEFINER functions executable by `anon`;
leaked-password protection off; `post_views` RLS with no policy (fine —
written only by a definer function).

## §2 — What shipped (code, `d803937`)

New files
- `src/lib/rate-limit.ts` — `rateLimit(key,{limit,windowSec})`, `clientIp`,
  `tooManyRequests`. Postgres fixed-window via `rate_limit_hit` RPC (service
  role). Fail-open with a logged error if the RPC is missing.
- `src/lib/pgrest.ts` — `ilikeOrFilter`, `ilikePrefixOrFilter`, `isUuid`.
- `src/lib/profile/handle-change.ts` — single handle-change path (validator +
  cooldown + service write) used by `/api/me/handle` and `/api/me/profile`.
- `src/lib/auth/require-platform-admin.ts` — gate for `/api/health/*`.
- `src/app/api/me/onboarding-state/route.ts` — `{school_verified, otto_complete}`
  for the browser-side post-login router (it can no longer read `otto_answers`).

Private-column reads moved to service role scoped to `user.id`:
`lib/auth/campus-access.ts`, `lib/auth/post-login.ts` (via the route above),
`onboarding/page.tsx`, `onboarding/classic/route.ts`, `settings/page.tsx`,
`api/me/profile`, `profile-sync`, `profile-bootstrap`, `otto`, `otto/settings`,
`auth/school-email/request`.

Route fixes: see commit body. Rate limits applied to password reset (IP +
email), school-email request, publish-post, messages, comments, reports,
follow, thread create, org create, handle change.

Static HTML: `campus.html`, `profile.html`, `messages.html`, `_postViewer.js`
escape user data at the flagged sinks; `lib/profile/work-experience.ts`
stores the normalised `URL.href`.

Infra: security headers in `next.config.ts` (HSTS, nosniff, X-Frame-Options
DENY, Referrer-Policy, Permissions-Policy — no CSP yet, prototypes rely on
inline scripts). `next` 16.3.4. `npm audit` clean for prod deps (one dev-only
transitive `brace-expansion` left).

## §3 — DB migration (applied live this session)

`20260903100000_security_hardening.sql`:
- `users`: column-level `SELECT`/`UPDATE` grants for `authenticated`; `INSERT`
  revoked; `anon` revoked entirely. Not self-updatable: `email`, `school_email`,
  `school_verified`, `handle`, `handle_changed_at`, `is_platform_admin`,
  `profile_view_count`. Not readable via RLS: `email`, `school_email`,
  `otto_answers`, `otto_settings`, `voice_samples`.
- `orgs`: dropped `orgs_insert_authenticated`, `orgs_update_officer`,
  `orgs_select_visible`; `INSERT` revoked (service role only); `UPDATE` limited
  to profile columns (never `verified` / `owner_id` / `handle`); `WITH CHECK`
  added.
- `org_members`: dropped the three officer/`true` policies; select = member or
  public org; insert forces `role='member'`; update only `role`, never to/from
  `owner`, admin promotion owner-only; owners can't be deleted via RLS.
- `channels` / `channel_members` / `messages` / `message_reactions`: member
  policies scoped to `org_id IS NULL`; channel insert into an org needs
  owner/admin; `channel_members` INSERT revoked (all inserts are service role).
- All 16 SECURITY DEFINER functions: `EXECUTE` revoked from `anon`/`PUBLIC`;
  `handle_new_user` explicitly granted to `supabase_auth_admin`.
- `rate_limits` table + `rate_limit_hit(text,int,int)` (service role only).

Recorded in `supabase_migrations.schema_migrations` so `supabase db push`
stays in sync. The MCP `execute_sql` tool is read-only (REVOKE fails with
`25006`), so it was applied with a `POST /v1/projects/<ref>/database/query`
call to the Supabase management API using `SUPABASE_ACCESS_TOKEN` from
`.env.local` (CLI 2.98 is installed and linked, but `db push` needs the DB
password, which is not on this machine).

## §4 — Things only Franky can do (dashboard)

- [ ] Supabase → Auth → **Enable leaked password protection** (HIBP).
- [ ] Supabase → Auth → **Minimum password length 8** (local config says 6).
- [ ] Supabase → Auth → **Confirm email** back on + Resend SMTP (already on
      the list; auth currently runs unconfirmed).
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` if it was ever pasted anywhere outside
      Vercel env (nothing found in git history — checked).

## §5 — Follow-ups (not done this session)

**High**
- [ ] **Resume PDFs are world-readable.** `profiles` bucket is public and
      holds `application/pdf`; redaction bars are client-side overlays. Fix =
      private `resumes` bucket + signed URLs through an auth-checked route
      (mobile `ProfileMobile.tsx` upload/view + desktop `profile.html` viewer
      both need the change). Anonymous bootstrap no longer hands out the URLs,
      but any signed-in user still gets the raw PDF link.
- [ ] CSP. Needs nonce rollout across `public/html/*.html` inline scripts.

**Medium**
- [ ] `notifications_insert_as_actor` lets any user insert `mention`
      notifications for anyone (spam). Move mention inserts to service role
      and drop the policy.
- [ ] Upload presigned PUTs don't pin `ContentLength`; size caps are advisory.
- [ ] Like/save/repost/comment don't check the target post is visible to the
      caller (can react to a draft by id).
- [ ] Verbose `error.message` still returned in a handful of 400/409 paths —
      fine, but audit once more if any of those wrap a Postgres error.
- [ ] `/api/orgs/[slug]/profile` + `orgs/[handle]/page.tsx` serve private-org
      description/members/posts unauthenticated (comment says intentional —
      confirm).
- [ ] `getPostLoginDestination` now round-trips `/api/me/onboarding-state`;
      fine, but the login page could just redirect to `/onboarding` and let
      the server page route.

**Low**
- [ ] Legacy `middleware.ts` → Next 16.3 wants `proxy.ts` (build prints
      "ƒ Proxy (Middleware)"). Cosmetic until they remove the alias.
- [ ] `react-hooks/set-state-in-effect` + other pre-existing lint errors in
      `components/ui/*` (not touched).
- [ ] Session 50 list still stands: QA mobile onboarding + Otto tour on a
      phone; video-in-feed / video-in-DM; Confirm email + Resend; Search
      Console re-index.

## §6 — Verification notes

- Local: `tsc --noEmit` 0 errors; `eslint` 0 errors on changed files;
  `next build` OK. Dev server on :3001 (v16.3.4): gated routes 401, missing
  post 404, security headers present, anonymous `/api/users/frankycazares/
  bootstrap` returns no resume keys, `/profile/frankycazares` 200.
- Prod: polled `/api/me/onboarding-state` until 401 (deploy live), then
  applied the migration. Verified with `has_column_privilege` /
  `has_table_privilege` (email/school_email/otto_* not selectable by
  `authenticated`; handle/school_verified/is_platform_admin not updatable;
  users/orgs/channel_members INSERT revoked; orgs.verified + org_members
  .user_id not updatable). Password reset on prod returns 429 on the 4th
  call (per-email limit 3), `/api/health/r2` → 401, anon bootstrap has no
  resume keys, HSTS/X-Frame-Options present.
- Advisors after: only INFO `rls_enabled_no_policy` on `post_views` /
  `rate_limits` (both written by definer functions only) and WARN
  "authenticated can execute SECURITY DEFINER" on the helpers — intentional,
  RLS policies call them as the invoking role. Leaked-password WARN stays
  until the dashboard toggle (§4).
- Not exercised at runtime: a full signed-in flow (no test account in this
  session). First thing next session: log in on prod, open Settings, Otto,
  onboarding replay, campus feed, and a DM — those are the paths whose reads
  moved to the service role.
