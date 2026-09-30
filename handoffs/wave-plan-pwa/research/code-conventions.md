# PWA research — the conventions a PWA build must follow (2026-09-24)

Scope: how Vibe's migrations, API routes, env vars, tests, Settings page and phone sheets are written today,
so the installable-app build (manifest, service worker, iOS install coaching, push) reads like the rest of
the codebase. Read-only pass over `main` at `9c0e645`. Repo claims cite `path:line`. Web/doc claims cite
the source. Anything not confirmed is marked **UNVERIFIED**.

---

## §0 — At a glance (plain English)

1. **Every database change is one long, self-explaining SQL file** named by date and time. It explains
   itself in a header, checks its own work inside the transaction, carries its own undo, and only reaches
   the live database when Franky says yes. A person runs it through Supabase's management API with
   `curl`, then records it in a bookkeeping table.
2. **The database permissions are the real lock, not the app code.** Anyone's browser holds the public
   key, so a new table (say, a list of phones that get notifications) must be locked in the database
   itself. The server reads and writes it with the admin key.
3. **Every API route follows the same order:** check who you are, check the request, spend rate-limit
   budget, check Terms and suspensions, then do the work. Errors come back as `{ ok: false, error, code }`.
4. **Secrets are documented in `.env.example` with a paragraph each**: what it is, where to set it, what
   breaks without it. **Vercel Preview uses the live database**, so risky secrets go on Production only.
5. **Tests use Node's own test runner**, one `*.test.ts` file beside each pure module. Anything React or
   server-only is not unit-tested; it is walked in a browser at phone width.
6. **Settings is one React page for phone and desktop.** A new section is a new card in one list. There is
   no static-page copy of Settings.
7. **Phone pop-ups are "vaul" bottom sheets** in cream with a drag handle. Colours are typed as hex values,
   not CSS variables (one of the variables is silently broken, see §6).

---

## §1 — (a) Migrations

**Plain English.** A new table for push subscriptions would be one file in `supabase/migrations/`, named
for the moment it was written. It locks the table so only the server can touch it, proves the lock inside
the same transaction, and is applied to the local test copy first. Production gets it only with Franky's
explicit yes, through a `curl` call. The app code ships first and must work while the table is missing.

### Naming and ordering
- `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`. The newest are
  `20260922150000_billing_stripe.sql` and `20260923090000_moderation_foundation.sql`.
- **Production is at `20260923090000`** (handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md:210-211,252).
  **`20260922150000_billing_stripe` is written but NOT applied to production** (same file:62-63). Its header
  says the orchestrator renumbers it before any production apply, "to a slot above every applied version
  and below every written-but-unapplied one" (supabase/migrations/20260922150000_billing_stripe.sql:85-90).
  So a PWA migration applied before billing makes billing's renumber land above the PWA one.
- Rule **H2**: gate on "my predecessor present and my own version absent", never on `max(version)`
  (handoffs/wave-plan-week1/rulings.md:29). A PWA migration's predecessor today is `20260923090000`.

### File anatomy (copy this shape; billing_stripe is the cleanest example)
The header comment carries these sections in order (supabase/migrations/20260922150000_billing_stripe.sql):
`WHY THIS EXISTS` → `WHAT THIS FILE DOES` → `DOES NOT` → `WHY THESE SHAPES` (:47) → `LOCKING` →
`PRODUCTION` / deploy order (:76) → `NUMBERING` (:85) → `LOCAL APPLY` (:91) → `HOW TO APPLY BY HAND` with a
read-only pre-flight (:98) → `POST-CHECK` (:141) → `LOCAL ACCEPTANCE PROBES` → `ROLLBACK` (:183, one
transaction, restores only this file's change, deletes its own `schema_migrations` row).
The body is: `begin;` (:202) → `set local lock_timeout = '5s';` (:207) → a `do $$` guard that refuses a
second run → DDL + `comment on table` → access block → a `do $$` post-check that raises on any miss →
`notify pgrst, 'reload schema';` (:410) → `commit;` (:412). Wrapping in `begin/commit` is required because a
bare `set local` does nothing (rulings.md M10).

### How a per-user table is locked — the three shapes in use
1. **Service-role only (the default for private data).** `billing_customers`, one row per account:
   ```sql
   create table public.billing_customers (
     user_id uuid primary key references public.users(id) on delete cascade, ...);
   alter table public.billing_customers enable row level security;          -- zero policies
   revoke all on table public.billing_customers, public.billing_events from anon, authenticated;
   revoke all on sequence public.billing_events_id_seq from anon, authenticated;
   grant all on table public.billing_customers, public.billing_events to service_role;
   ```
   (supabase/migrations/20260922150000_billing_stripe.sql:227-232, 264-274). **Why the sequence line:**
   Supabase's default ACL gives anon and authenticated full rights on every new table AND every new
   sequence, so an identity column's sequence must be revoked by name (:47-53). A `uuid` key avoids this
   (20260922104000_email_sends.sql:56).
2. **Service-role only, least privilege, re-granted by name.** `account_restrictions`:
   `revoke all ... from anon, authenticated, service_role;` then
   `grant select, insert, update, delete ... to service_role;`, with no TRUNCATE
   (supabase/migrations/20260923090000_moderation_foundation.sql:1857-1866). The comment explains that the
   default ACL also hands service_role everything, so a bare grant "would be a no-op" (:1929-1936).
3. **Own row readable, writes server-only.** `entitlements`: `REVOKE ALL ... FROM anon, authenticated;` then a
   **column-level** `GRANT SELECT (user_id, tier, ...) ... TO authenticated;` and
   `CREATE POLICY "entitlements_owner_select" ... FOR SELECT TO authenticated USING (auth.uid() = user_id);`
   (supabase/migrations/20260912101000_entitlements.sql:166-188). The column grant means `select=*` is
   denied, so callers must name columns.

Also standard: `on delete cascade` to `public.users(id)` for data that should die with the account (billing_customers);
no FK when a row must outlive the account (billing_events.user_id, moderation_actions); partial indexes
for the only queries asked (moderation_foundation.sql:1852-1855); a `comment on table` that says "Service
role only" and why.

### The standing rules every PWA migration inherits
- **"Grants, not routes, are the boundary."** Origin: supabase/migrations/20260906130000_consent_db_boundary.sql:4-10
  (an authenticated session can write straight through PostgREST with its own JWT, skipping every route
  gate). Restated at 20260912101000_entitlements.sql:39-40 and 20260922150000_billing_stripe.sql:47. Memory
  `project_security_model`: "a route gate without a policy is UI, not a boundary."
- **Private data is service-role only.** Self-reads of private columns go through
  `createSupabaseServiceClient()` + `.eq("id", user.id)` (src/app/settings/page.tsx:25-36 is an example).
- **Never REVOKE EXECUTE on a public function** (rulings.md:3-7; S63 handoff §4). On production's Postgres
  image (17.6.1.111) calling a function without EXECUTE crashes the backend. Grant any new public function
  to anon, authenticated and service_role, and refuse inside (return false/null or
  `RAISE ... USING ERRCODE = '42501'`). Every post-check ends with the count query in rulings.md:7, which
  must be 0 (billing_stripe.sql:396-406 shows it inside the body).
- **Content-write policies carry `has_recorded_consent()` / `can_publish_now()`** (consent_db_boundary.sql;
  moderation_foundation.sql:77-82). A push-subscription table written only by the service role needs
  neither. If any client write policy is ever added, it must AND `NOT is_restricted_now()` at least.
- **Deploy order is code first, migration second.** Code treats a missing table as "no row" with the
  42P01 / PGRST205 matcher (src/lib/moderation/access.ts:68-73, copied in src/lib/billing/customers.ts).
  Rulings **M9**: once a migration is live, never instant-roll Vercel back past that batch's code.

### How migrations reach production (do not run; for the orchestrator only)
- The Supabase MCP `execute_sql` is **read-only**. DDL goes through the management API with **curl**
  (Python urllib gets a Cloudflare 1010 block). Recipe, verbatim from
  supabase/migrations/20260922150000_billing_stripe.sql:127-139:
  ```
  export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
  curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data "$(jq -n --rawfile q supabase/migrations/<file>.sql '{query:$q}')"
  # `[]` = success. Then record it:
  INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<version>', '<name>');
  ```
  Also documented at handoffs/2026-09-03-session-52-security-sentinel.md:122-124 and in memory
  `project_security_model`. `supabase db push` is not usable (needs the DB password, not on this Mac).
- Only with **Franky's explicit yes**, after a read-only pre-flight (version gate, target state,
  `pg_default_acl`, no long transactions) and the local acceptance pass logged in the handoff
  (billing_stripe.sql:98-126). Production smoke is **GET-only** (rulings.md M8, :44).
- **Local test copy**: acceptance agent only, never `supabase db reset` by implementers (rulings.md:11-16):
  ```
  export PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"
  PSQL() { docker exec -i supabase_db_vibe psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
  PSQL -f - < supabase/migrations/<file>.sql   # then the same schema_migrations INSERT
  ```
  (rulings.md H5, :32; billing_stripe.sql:91-96). Commit wording for such a file: "… — written, applied to
  the test copy only" (git log: `4d9d66c`, `5c1c8c1`).

---

## §2 — (b) API route conventions

**Plain English.** Routes are plain Next.js route handlers (there are zero Server Actions in `src/`, so do
not follow the Next PWA guide's Server Action examples). Each one signs the caller in from the cookie,
checks the body, spends rate-limit budget, checks Terms and suspensions, then works with the admin client
where the table is locked. Failures are short JSON with a machine `code`, and a 500 always says only
"Request failed" while the real error goes to the server log with a `[tag]`.

### Authentication
- Cookie session: `createSupabaseServerClient()` (src/lib/supabase/server.ts:16), then
  `const { data: { user }, error: authErr } = await supabase.auth.getUser();` and
  `if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });`
  (src/app/api/me/mute/route.ts:42-49; identical in src/app/api/billing/checkout/route.ts:98-105).
- Admin client: `createSupabaseServiceClient()` (src/lib/supabase/service.ts:17; `import "server-only"`),
  `isSupabaseServiceConfigured()` (:26). Never import it into a client component.
- Platform-admin routes: `const gate = await requirePlatformAdmin(); if (!gate.ok) return gate.response;`
  (src/lib/auth/require-platform-admin.ts:21; used by src/app/api/health/resend/route.ts:7-9).
- Server libraries start with `import "server-only";` (rate-limit.ts:1, require-terms.ts:1, access.ts:1).

### Order of checks (write routes)
auth → parse + validate (400) → rate limit (429) → Terms / restriction gate (403) → look-ups → write →
side effects. Written out at src/app/api/me/reports/route.ts:239-255 ("Order — auth, validate, limit, gate,
look the target up, snapshot, insert, alert"). **Limiter after validation** so a bad body doesn't spend a
student's budget (memory `project_security_model`, learned 2026-09-07), but before any lookup that could
become an enumeration oracle (reports/route.ts:250-254).

### Error shape
- `{ ok: false, error: "<sentence>", code?: "<snake_code>" }`; success is `{ ok: true, ... }`.
- `400 "Invalid JSON"` on a body that won't parse (mute/route.ts:51-56). 500s are
  `console.error("[route.tag]", error)` + `{ ok: false, error: "Request failed" }` (mute/route.ts:85-88).
  Never echo database details or matched words.
- Local refusal helpers per route are normal: `const refuse = (status, code, error) => NextResponse.json(...)`
  (checkout/route.ts:63-64). A docblock above the handler lists every refusal in order
  (checkout/route.ts:29-50).
- Shared codes (handoffs/wave-plan-moderation/plan.md:41-48): `terms_required`, `school_email_required`,
  `account_restricted` (403), `content_blocked` (422). The client maps codes to copy in
  src/lib/feedback/failure-copy.ts:117-194. A 403/409 `error` is shown verbatim only if it passes
  `isHumanSentence` (failure-copy.ts:57-66): capital first letter, 3+ words, no "+", no "id"/"json".

### Rate limiting (the DB limiter)
- `rateLimit(key, { limit, windowSec, failClosed? })` (src/lib/rate-limit.ts:25) calls the Postgres RPC
  `rate_limit_hit` with the service client. **Fail-open by default**; `failClosed: true` only when the limiter
  IS the security control (rate-limit.ts:8-15). Refuse with `return tooManyRequests(rl, "<sentence>")`
  (rate-limit.ts:133), which sets `Retry-After`.
- Key style: `"<route-name>:${user.id}"`, e.g. `report:${user.id}` 10/3600 s (reports/route.ts:289),
  `billing-checkout:${user.id}` 10/600 s declared as a `const X_LIMIT` (checkout/route.ts:51, :136).
  Anonymous endpoints key on `clientNetworkKey(req)` (IPv6 /64 bucket, rate-limit.ts:69).
- A subscribe/unsubscribe pair would be a small per-user budget (e.g. `push-subscribe:${uid}`); the
  numbers are a design call, not a convention. UNVERIFIED: no existing limit for "device registration".

### Terms and account restrictions
- `requireTermsAccepted(user.id)` → 403 `terms_required` (src/lib/legal/require-terms.ts:27; body at :9-14).
- `requireNotRestricted(user.id)` = Terms + no suspension/ban (src/lib/moderation/access.ts:203);
  `requireCanPublish(user.id)` = that + verified school email (access.ts:217). Pattern:
  `const gate = await requireNotRestricted(user.id); if (gate) return gate;` (reports/route.ts:294-295).
  Both **fail closed** on a read error (access.ts:170-184).
- Which one a push route should call is a design choice: subscribing is not publishing, so
  `requireCanPublish` is wrong; `requireNotRestricted` or none. `/settings` itself is deliberately NOT
  Terms-gated so deletion stays reachable (src/app/settings/page.tsx:60-62).
- **The proxy already refuses every non-GET `/api/*` call from a restricted student** except logout,
  `DELETE /api/me`, `/api/billing/portal`, `/api/me/block`, `/api/me/mute` (src/proxy.ts:172-177,
  :235-243). A new "turn notifications off" route is refused for them unless added there (decision for
  Franky, see the summary). The proxy's 403 body must stay identical to `accountRestrictedResponse()`
  (proxy.ts:179-196).

### Sentry
- No route calls `Sentry.captureException`. Uncaught route errors reach Sentry through
  `export const onRequestError = Sentry.captureRequestError;` (src/instrumentation.ts:13); client render
  errors through src/app/global-error.tsx:13. Handled errors are `console.error("[tag]", ...)` only.
  UNVERIFIED whether `console.error` reaches Sentry: `getSentryInitOptions()` adds no console integration
  (src/lib/sentry-config.ts:117-131), so assume handled errors live in Vercel logs only.
- Sentry is off when `NEXT_PUBLIC_SENTRY_DSN` is unset (local dev) and scrubs auth tokens in `beforeSend`
  (sentry-config.ts:9-43, :117-131). A push endpoint URL is a bearer capability: never log it, and never put
  it in an error message (billing's rule "error holds a short message only, never a payload, a key or an
  email", billing_stripe.sql:39-44, is the precedent).

### Other route details that matter for push
- `export const runtime = "nodejs";` where a Node library is needed (src/app/api/billing/webhook/route.ts:19-20;
  src/app/api/resume/[...path]/route.ts:20). A `web-push`-style sender needs Node crypto, so nodejs.
- A platform-admin health probe per external service already exists (`/api/health/{resend,r2,sentry,...}`,
  e.g. src/app/api/health/resend/route.ts:7-31: 503 when unconfigured, 502 when the provider fails). A
  `/api/health/push` would match.
- **Notification rows are made in two places**: DB triggers (`notify_on_like_insert`,
  `notify_on_comment_insert`, `notify_on_connection_insert`) and service-role route code
  (src/lib/mentions.ts, src/lib/orgs/membership.ts, org invite routes) — see
  20260922120000_t2_notification_writes_and_helper_grants.sql:23-34. A push sender hooked only into routes
  would miss the trigger-made rows.
- Client calls go through `vibeRequest(url, { json, failure: "Couldn't …" })` (src/lib/feedback/request.ts:136);
  it never throws and toasts the mapped failure. Static pages use `window.vibeRequest` from
  public/html/_persistence.js:296.

### The proxy and the new files
- `src/proxy.ts` already expects a service worker: `.js`, `.json`, `.webmanifest` are in `ASSET_EXTENSIONS`
  so a restricted student's `/sw.js` or manifest request is never redirected to an HTML page
  (src/proxy.ts:84-98, :111-116). But the matcher only skips images and `_next` (proxy.ts:314-317), so
  `updateSession()` (a Supabase `getUser()` call, src/lib/supabase/middleware.ts:36-38) still runs on every
  `/sw.js` and manifest fetch. Adding them to the matcher's exclusion is cheap; decide explicitly.
- Security headers live in `next.config.ts` `headers()` (next.config.ts:36-90; `X-Frame-Options: SAMEORIGIN` at :49-57). The Next 16 PWA guide
  bundled in `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:610-666` adds a `/sw.js`
  block (`Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type`, a CSP). **Do not copy its
  global `X-Frame-Options: DENY`** — Vibe frames its own pages and must stay `SAMEORIGIN`
  (next.config.ts:49-56; memory `project_security_model`).
- Metadata files sit in `src/app/` (`icon.png` 192x192, `apple-icon.png` 180x180, `icon.svg`, `favicon.ico`,
  `robots.ts`). A `src/app/manifest.ts` returning `MetadataRoute.Manifest` matches `robots.ts` and the
  bundled doc `.../03-file-conventions/01-metadata/manifest.md:22-29`.

---

## §3 — (c) Environment variables

**Plain English.** Every secret gets a paragraph in `.env.example`: what it does, that it's server-only,
where it goes on Vercel, and what happens if it's missing. Switches are off unless set to exactly `true`.
The big rule: Vercel's Preview deployments talk to the LIVE database, so anything that could touch real
students (payments then, push notifications now) is set on Production only.

### How `.env.example` documents a secret
- `.env.example` is the only tracked env file (`.env*` ignored, `!.env.example`, .gitignore:37-38).
- **RESTRICTION_PEPPER** (.env.example:33-54): one comment block saying server-only / never
  `NEXT_PUBLIC_*`; minimum length and how to generate (`openssl rand -hex 32`); what it does; what happens
  UNSET (fails closed with 503 `not_configured`, nothing else breaks); where to set it ("Vercel (Production
  only, Sensitive)"); **"IT CAN NEVER BE ROTATED"**; and why the line itself is **left commented out**
  (a copyable placeholder would arm a secret that lives in the repo).
- **STRIPE_*** (.env.example:72-106): "server-only: never NEXT_PUBLIC_*"; "NEVER set any of them on Vercel
  Preview. Preview shares the production Supabase database" (:73-74); test key locally in
  `.env.development.local`; the live key's exact permission list; the webhook's exact URL (www, because the
  apex 308-redirects) and event list.
- **BILLING_ENABLED** (.env.example:108-114): "Exactly `true` turns on …; anything else, or unset, is off",
  plus what else it needs, and the production rule. Code twin: `billingEnabled(env = process.env)` in a pure
  config module (src/lib/billing/config.ts:102-108), testable with a fake env.
- Browser-safe values only are `NEXT_PUBLIC_*` (Supabase URL/anon key, site URL, Sentry DSN,
  `NEXT_PUBLIC_SHOW_GLOBAL_FEED` read in src/lib/feature-flags.ts:6-8). The bundled Next PWA guide names
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (progressive-web-apps.md:547-548).

### "Vercel Preview shares the PRODUCTION database"
- Stated at .env.example:73-74 and handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md:86-87
  ("`BILLING_ENABLED=true` on Vercel production only (never Preview: Preview shares the production
  database)"). UNVERIFIED in the Vercel dashboard this pass (no Vercel API calls were made); treat as true.
- What it means for push, by the same logic as Stripe:
  - A preview build holding the VAPID **private** key could send real notifications to real students from
    unreviewed code. Set `VAPID_PRIVATE_KEY` (and any `PUSH_ENABLED` switch) on **Production only,
    Sensitive**, and leave the sender fail-closed (503 / no-op) when unset, like `billingEnabled()`.
  - A student who opens a preview URL and opts in writes a subscription row into the **production** table,
    bound to the preview origin's service worker. Storing the origin (or a VAPID key id) on each row lets the
    sender skip rows it cannot serve. Design call, not an existing convention.
  - Rotating VAPID keys invalidates every existing subscription (a subscription is created against one
    `applicationServerKey`). General Push API behaviour, **not re-checked for this file**. Document it in
    `.env.example` the way RESTRICTION_PEPPER says "can never be rotated".
- Local dev: `.env.development.local` (gitignored) is read first by `next dev`. It points Supabase at the local
  stack (`http://127.0.0.1:54321`) and blanks Resend, R2, Sentry and the management token (S63 handoff §5;
  rulings.md B4). It already holds the local STRIPE_*, BILLING_ENABLED and RESTRICTION_PEPPER entries
  (variable names checked 2026-09-24, values not read). Local VAPID keys belong there.
- One-off setup scripts follow `scripts/stripe-setup.mjs`: usage block at the top, `--check` read-only mode,
  refuses live keys without `--live --yes`, never prints a secret (scripts/stripe-setup.mjs:1-40). Local-only
  scripts refuse any non-localhost host (scripts/local-seed.mjs:9-11).

---

## §4 — (d) The test stack

**Plain English.** There is no Jest or Vitest. Tests use Node's built-in runner and live beside the file they
test. Only "pure" files can be tested that way, so logic worth testing (for example "should the install
card show on this phone?") goes into a small pure file and the React component just draws it. Anything that
touches the database is checked on a private practice copy of Vibe on Franky's Mac, then walked by hand
in a browser at phone width.

### Runner and layout
- `node --test --experimental-strip-types <file>.test.ts` — Node's `node:test` + `node:assert/strict`. No
  `test` script in package.json (package.json:5-10 has dev/build/start/lint only). This Mac runs Node
  v25.9.0. Re-run 2026-09-24: `src/lib/billing/config.test.ts` + `entitlement-map.test.ts` → 26 pass, 0 fail.
- ~30 co-located test files, all under `src/lib/**` and `src/components/mobile/**` (e.g.
  src/lib/billing/*.test.ts, src/lib/moderation/{identity,text-filter,profile-filter}.test.ts,
  src/components/mobile/campus-confirm-banner-view.test.ts). None for routes or React components.
- Gates besides unit tests: tsc and eslint ("Implementers run unit tests, tsc and eslint only",
  rulings.md:16). `npm run lint` exists; the exact tsc invocation (`npx tsc --noEmit`) is UNVERIFIED.

### What a testable module must look like
- **Pure**: no `import "server-only"`, no runtime `@/` imports, only erasable TypeScript (no `enum`,
  `namespace`, parameter properties) — src/lib/billing/config.ts:1-10 says so in its header;
  src/lib/moderation/identity.ts:1-3 likewise, which is why the pepper is read in access.ts instead.
- The test imports it through a variable specifier so tsc accepts the `.ts` path:
  `const specifier = "./config.ts"; const {...} = (await import(specifier)) as typeof import("./config");`
  (src/lib/billing/config.test.ts:18-33).
- If the module imports siblings without extensions, the test registers a resolve hook
  (`module.registerHooks`, Node ≥ 22.15) that retries with `.ts` (src/lib/moderation/identity.test.ts:7-30;
  src/components/mobile/campus-confirm-banner-view.test.ts:10-26).

### How the billing tests are structured (the model to copy)
- A header docblock: what is tested, the contract section it pins (handoffs/wave-plan-stripe/contract.md §B),
  the exact "Run with:" command, and why the import looks the way it does (config.test.ts:1-13).
- Fake inputs only: `env({...})` builds a fake `process.env`; key-shaped strings are a prefix plus filler
  (`"sk_test_" + "x".repeat(24)`), never a real key (config.test.ts:35-41). Subscriptions are hand-built
  objects with only the fields the mapper reads (entitlement-map.test.ts:1-12).
- Cross-checks against rules that live in server-only files are done by **copying** that rule into the test
  and saying where it came from (entitlement-map.test.ts:13-16, copying `isPlusActive` from
  src/lib/premium/require-plus.ts:107-126).
- One `test("plain sentence of the behaviour", ...)` per case; no describe blocks (0 suites in the run above).
- UI precedent: `campus-confirm-banner-view.ts` holds the pure "which card, and when is it hidden" logic and
  is tested; `CampusConfirmBanner.tsx` only fetches and draws (src/components/mobile/CampusConfirmBanner.tsx
  header). An install-coach "platform / installed / dismissed → which card" function fits this exactly.

### The local Supabase test copy (S63 handoff §5, handoffs/2026-09-22-session-63-test-stack-and-privacy-lock.md:78-88)
- Docker Desktop running; `supabase start` / `supabase stop`; rebuild with `supabase db reset` then
  `node scripts/local-seed.mjs` — **acceptance agent only** (rulings.md:16, B5).
- Seeded accounts, password `vibe-local-1234`: avery (owns three test clubs), blake (IU), casey (Purdue),
  drew (brand-new, unverified, no campus), emery (club admin).
- Proof step before any write: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/users/avery_owner/bootstrap`
  must print 200 (that handle exists only locally), rulings.md B4.
- `psql` is not installed; use the docker PSQL function (§1). Never call a function as a role lacking EXECUTE
  on the local DB (it crashes it; S63 §4).
- Safety: the local dashboard binds 0.0.0.0 with default keys; `supabase stop` on public Wi-Fi.

### Dev server (.claude/launch.json)
- `vibe`: `npm run dev`, port 3000 (the one acceptance and the proof step use).
- `vibe-smoke`: `npx next dev`, port 3100, `autoPort: true`.
- Push needs a secure context. The bundled Next guide says to test push with `next dev --experimental-https`
  (progressive-web-apps.md:599-608). `localhost` is normally a secure context for service workers; whether
  iOS push can be exercised at all from a local build is UNVERIFIED here (another research lens owns it).
- After acceptance: walk the change at **375px as an ordinary non-admin student**, prove who is signed in
  via `/api/me/profile-bootstrap` first (a magic link does not switch accounts), and beware a stale dev server
  (memory `feedback_browser_pass`).

---

## §5 — (e) The Settings page

**Plain English.** Settings is a single React page used on both phone and desktop. It is a stack of cards
("Account info", "Campus", "Handle", "Campus tour", "Blocked users", "Help & safety", "Sign out", "Delete").
A "Notifications" card (turn on, turn off, "install Vibe first" on iPhone) would be one more card in that
stack. The old static desktop pages have no Settings of their own; their gear icon just opens this page.

### Structure
- Server page: src/app/settings/page.tsx:16-84. Signed-out → `redirect("/auth/login?next=/settings")`
  (:21-23); self-read of private columns with the service client (:25-37); **no consent gate on purpose**
  (:60-62); renders `<CampusAppShell><SettingsClient profile={...} campus={...} /></CampusAppShell>`.
- Client: src/components/settings/SettingsClient.tsx (**1,639 lines** — grep plus ranged Reads only).
  `SettingsClient` renders a fixed order (:115-126): `AccountCard`, `CampusCard`, `HandleCard`,
  `CampusTourCard`, `BlockedUsersCard`, `HelpAndSafetyCard`, `SignOutCard`, `DangerZone`, `LegalFooter`.
  **Adding a section = write a `function XCard()` and add one line to that list.**
- Card anatomy (CampusTourCard, :131-190, is the smallest self-contained one):
  `<section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>` → `<SectionTitle>` → a DM Sans 13.5px
  `#5C5853` paragraph → an orange pill button. Deep-linkable cards add `id="…"` and `scrollMarginTop: 24`
  (`#campus` :657, `#help-safety` :1446-1449, `#delete-account` :1264-1265); other screens link to
  `/settings#campus` (src/components/mobile/CampusConfirmBanner.tsx:137-142, src/app/campus/campus-home.tsx:4290).
- File-local primitives, **not exported**: `PAGE_BG` (:40), `CARD_GLASS` (:45-58), `SectionTitle` (:1572),
  `Row` label/value/hint grid (:1589), `HelpLink` (:1486). A card in its own file must either import newly
  exported primitives or copy them. Choosing is a batch-ownership decision: SettingsClient.tsx should
  belong to exactly one batch in a wave (memory `feedback_workflow_waves`).
- Data: cards fetch their own data client-side with `vibeRequest` and render `LoadFailed` on a refused read
  (imports at :6-11); BlockedUsersCard (:203-315) is the list-with-actions example.
- Styling is inline style objects, not Tailwind classes or shadcn components. Phone padding comes from
  `.vibe-settings-main` in src/app/globals.css:2831-2839 (≤760px, adds `env(safe-area-inset-top)`).
- Entry points: desktop left nav (src/components/LeftNav.tsx:138), phone profile floating gear
  (src/components/mobile/ProfileMobile.tsx:1580), static desktop profile gear (public/html/profile.html:3137-3138).
- **Static-page equivalent: none.** Phones (< 900px, src/lib/use-is-mobile.ts:14) always get React trees
  (src/app/profile/ProfileSwitch.tsx, src/app/messages/MessagesSwitch.tsx); the static `/html/*.html` shells
  are the desktop app only. So install coaching and the notification opt-in only need React on phones. If a
  desktop static page ever needs a prompt, the static twins are `window.vibeToast` / `window.vibeRequest`
  (public/html/_persistence.js:224, :296) and `_safetyActions.js` for sheets.

---

## §6 — (f) Design tokens, fonts, sheets and modals

**Plain English.** Vibe is cream (#FAF7F2) with near-black text (#1C1C1E) and one orange (#FF5C35).
Headings are Fraunces (a serif), body text is DM Sans. On phones every pop-up is a bottom sheet that slides
up, cream, rounded at the top, with a small grey drag handle. Colours are typed as hex numbers in each file
because one of the shared colour names was accidentally overwritten by the component library.

### Tokens
- Spec: DOCS/DESIGN_SYSTEM.md (cream #FAF7F2, charcoal #1C1C1E, soft #2D2D2D, muted #8A8580, accent
  #FF5C35, green #2ECC71, lavender #C8B8FF, gold #F5C842, border rgba(28,28,30,.08)); no decorative emoji in
  UI chrome. Same values as CSS variables in src/app/globals.css:8-30 (`@layer base :root`).
- **Gotcha:** an unlayered shadcn `:root` at src/app/globals.css:135-168 redefines `--accent`, `--muted` and
  `--border` as greys (`--accent: oklch(0.97 0 0)`), and unlayered rules beat `@layer base`. So
  `var(--accent)` in a React route is near-white, not orange. That is why React code hard-codes hex. Read
  from the CSS; not measured in a browser (UNVERIFIED computed value). The static pages define their own
  `:root` and are not affected. `.dark` exists (globals.css:239) but nothing applies it.
- Values in live use: page `#FAF7F2`; heading `#1C1C1E`; body `#5C5853`; secondary `#8A8580`; eyebrow
  `#C84A20` (SettingsClient.tsx:78-90); primary action `#FF5C35` with `#FAF7F2` text.
- `src/app/layout.tsx:27-32`: `themeColor: "#FAF7F2"`, `viewportFit: "cover"`. Manifest `theme_color` and
  `background_color` should match #FAF7F2 so the iOS/Android launch screen doesn't flash white.

### Fonts
- Fraunces (400/700/900 + italic 400) and DM Sans (300–700) come from one Google Fonts `<link>` in
  src/app/layout.tsx:42-45. JetBrains Mono comes from `next/font/google` as `--font-mono`, and `<html>` gets the
  `font-mono` class (layout.tsx:9, :40). Components name fonts inline: `fontFamily: "Fraunces, serif"` /
  `"DM Sans, sans-serif"` (ReportSheet.tsx `FONT`/`SERIF` constants; SettingsClient throughout).
- Static pages load their own Fonts link with different weights (public/html/profile.html:17).
- Offline caveat for the service worker: fonts are cross-origin (fonts.googleapis.com / fonts.gstatic.com).
  An offline page that should look like Vibe must either cache those or fall back to system fonts. Design call.

### Type and button recipes (copy, don't invent)
- Section title: Fraunces 22px / 800 / `#1C1C1E` / letterSpacing -0.01em (SettingsClient.tsx:1572-1587).
  Sheet title: Fraunces 16–17px / 800 (ReportSheet.tsx:548-555; PostAudienceSheet.tsx:142-153).
- Primary pill: DM Sans 13px / 700 / letterSpacing 0.08em / padding 10px 18px / radius 999 / background
  `#FF5C35` / color `#FAF7F2` / shadow `0 6px 18px rgba(255,92,53,0.35), inset 0 1px 0 rgba(255,255,255,0.18)`
  (SettingsClient.tsx:168-188). Ghost button: 1px `rgba(28,28,30,0.12)` border, radius 999 (ReportSheet.tsx:557+).

### Phone sheets (vaul) — the house pattern
- Library: `import { Drawer } from "vaul";` (vaul ^1.1.2, package.json). Used by every phone sheet:
  src/components/mobile/{PostAudienceSheet,SharePostSheet,EditPostSheet,MutualsSheet}.tsx,
  src/components/safety/ReportSheet.tsx, src/components/orgs/OrgInviteSheet.tsx.
- Smallest complete example: src/components/mobile/PostAudienceSheet.tsx:95-175 —
  `<Drawer.Root open nested={nested} onOpenChange={(o) => { if (!o) onClose(); }}>` →
  `<Drawer.Portal>` → `<Drawer.Overlay>` → `<Drawer.Content aria-describedby={undefined}>` → handle div →
  `<Drawer.Title>` → scrolling body. Mounted only while open (the parent renders it conditionally).
- Shared chrome values (ReportSheet.tsx:519-555, same numbers in PostAudienceSheet.tsx:104-141):
  overlay `rgba(0,0,0,0.42)`; content `position: fixed; bottom/left/right: 0; background: #FAF7F2;`
  `borderTopLeftRadius/RightRadius: 20; paddingBottom: env(safe-area-inset-bottom, 0px);`
  `boxShadow: 0 -8px 32px rgba(0,0,0,0.18); outline: none`; `maxHeight: 80dvh` or an inner
  `maxHeight: calc(88dvh - 18px)` scroller with `overscrollBehavior: contain`; handle 38×4, radius 999,
  `rgba(28,28,30,0.18)`, margin `10px auto 4px` (ReportSheet uses `<Drawer.Handle>`).
- **Nesting:** a sheet opened from inside another vaul drawer passes `nested` / uses `Drawer.NestedRoot`,
  because vaul's iOS body-scroll lock is a module-level global (PostAudienceSheet.tsx:58-63;
  ReportSheet.tsx:373).
- **Z-index tiers (documented at ReportSheet.tsx:504-518, PostAudienceSheet.tsx:34-43):** phone tab bar
  9988 (globals.css:2686) → full-screen viewer/action sheets 10000/10001 → stacked sheets **10400/10401**
  → desktop modal 11000 → static toasts 11600 → React `ToastHost` 12000 (src/components/feedback/ToastHost.tsx:41).
  An install-coach sheet or push opt-in sheet uses 10400/10401 so a refusal toast still shows above it.
- Desktop variant: a portaled dialog, not vaul — `ReportModal` (ReportSheet.tsx:406-502): `createPortal` to
  body, `role="dialog" aria-modal="true" aria-label`, focus on mount, Escape closes, Tab trapped, body
  `overflow: hidden` while open, scrim `rgba(0,0,0,0.38)` as a plain div, box
  `width: min(420px, calc(100vw - 32px)); background: #FAF7F2; borderRadius: 16`. ReportSheet picks with a
  `variant: "sheet" | ...` prop (:372).

### shadcn / base-ui — present but not the pattern for sheets
- components.json: style `base-lyra`, `iconLibrary: "phosphor"`, aliases `@/components/ui`.
  src/components/ui/ holds `button`, `badge`, `separator` (the only `@base-ui/react` importers) plus
  Aceternity-style landing effects. No shadcn Dialog/Drawer/Sheet is installed; every product sheet and
  modal is hand-styled vaul or a portal. **Do not add a shadcn Dialog for the coach/opt-in**; match vaul.

### Banners and "Not now" (precedent for install coaching)
- `CampusConfirmBanner` (src/components/mobile/CampusConfirmBanner.tsx) + pure
  `campus-confirm-banner-view.ts` + its test: fetch with `vibeRequest({ quiet: true })`, decide the card in
  the pure function, "Not now" writes `sessionStorage` key `vibe_campus_confirm_dismissed`
  (campus-confirm-banner-view.ts:12-13), every storage call in try/catch, and "a failed load renders
  nothing: this is a nudge, never a blocker". Longer-lived flags use `localStorage` keys named
  `vibe_<thing>_v1` (e.g. `vibe_profile_tour_seen_v1`, SettingsClient.tsx:138-141).
- Phone routes are wrapped in `MobileShell` (src/components/mobile/MobileShell.tsx:25-39), which pads for
  the 64px tab bar + `env(safe-area-inset-bottom)`; each page owns its top safe area. A coach card that
  sits above the tab bar must clear both.

---

## §7 — Where the PWA pieces plug in (conventions applied, not decisions)

| Piece | Where, by convention | Evidence |
|---|---|---|
| Manifest | `src/app/manifest.ts` returning `MetadataRoute.Manifest`, beside `robots.ts`; colours #FAF7F2 | robots.ts; layout.tsx:27-32; Next doc manifest.md:22-29 |
| Service worker | `public/sw.js`, headers added to the existing `headers()` array in next.config.ts | next.config.ts:36-90; PWA guide:610-666 |
| Proxy | already treats `.js`/`.webmanifest` as files; decide whether to skip `updateSession` for them | proxy.ts:94-98, :314-317 |
| Subscription table | new migration, service-role only (billing_customers shape), `on delete cascade` to users, uuid key | §1 |
| Subscribe / unsubscribe | `src/app/api/me/<name>/route.ts`, auth → validate → `rateLimit` → gate → service-client write | §2 |
| Sender | server-only lib under `src/lib/<area>/`, pure mapping split out for `node --test`; runtime nodejs | billing/{config,entitlement-map,stripe}.ts split |
| Secrets | `.env.example` paragraph each; VAPID private + switch Production only, Sensitive | .env.example:33-114 |
| Settings | new `NotificationsCard` in SettingsClient's list, `id="notifications"` for deep links | SettingsClient.tsx:115-126 |
| Coach / opt-in UI | vaul sheet at z 10400/10401 + pure `*-view.ts` with tests | §6 |
| Health probe | `/api/health/push`, `requirePlatformAdmin`, 503 unconfigured / 502 provider | health/resend/route.ts |

### Things a builder would get wrong by following the generic Next PWA guide
1. It uses Server Actions (progressive-web-apps.md:410-470); Vibe has none. Use route handlers.
2. It sets `X-Frame-Options: DENY` globally (:626-627, explained at :661); Vibe must keep `SAMEORIGIN` (next.config.ts:49-57).
3. It keeps subscriptions in memory; Vibe needs a locked table (grants are the boundary).
4. It puts the VAPID keys in `.env` generically; Vibe must keep the private key off Preview (live database).

### Caching facts checked on production (plain GETs, 2026-09-24)
- `/html/_persistence.js` and `/icon.png`: `200`, `cache-control: public, max-age=0, must-revalidate`.
  The static pages load their scripts with no version query (public/html/profile.html:18, :30), so a
  cache-first service worker would pin stale desktop scripts. Network-first or no caching for `/html/*`.
- `/manifest.webmanifest` and `/sw.js`: `404` today (expected; nothing is built).




---

## §8 — Decisions for Franky and open questions (convention-driven only)

**Decisions (each has a recommendation; none blocks the plan):**
1. **Can a suspended or banned student turn push notifications off?** Today the proxy refuses every write
   from them except a short list (src/proxy.ts:172-177). Recommendation: yes — add the unsubscribe route
   to that list (it's "protecting yourself", like block and mute), and have the sender skip restricted
   accounts so they never get a push.
2. **Who can read the subscription table?** Recommendation: nobody but the server (billing_customers
   shape). The phone already knows whether it's subscribed (the browser's PushManager), so there is no
   reason to hand the browser the table.
3. **VAPID keys on Vercel:** Recommendation: Production only, Sensitive, with a `PUSH_ENABLED` switch that
   is off unless exactly `true` (the BILLING_ENABLED pattern), because Preview talks to the live database.
4. **Where the Settings card's code lives:** Recommendation: its own file, with `CARD_GLASS` and
   `SectionTitle` exported from SettingsClient.tsx by the one batch that owns that file in the wave.

**Open questions (UNVERIFIED this pass):**
- Whether `console.error` in routes reaches Sentry (no console integration found; assume it doesn't).
- The computed body background and `--accent` value in a React route (read from CSS, not measured).
- That Vercel Preview really shares the production database (stated twice in repo docs; not checked in
  the Vercel dashboard).
- The exact tsc command the gates use (`npx tsc --noEmit` assumed).
