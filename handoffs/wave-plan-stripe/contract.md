# Stripe v1 — wave contract (2026-09-22, session 64)

Source of truth for four parallel batches (A migration + ops, B lib, C routes, D /plus UI).
Code against THIS doc, not against another batch's in-progress file. Where the plan critic's
notes name your batch, they override this doc.

Grounding: `handoffs/2026-09-12-design-paywall-monetization.md` (§4 entitlements, §5 gates,
§7 Phase 1), Stripe's own guidance (`~/.claude/skills/stripe-best-practices/SKILL.md` and
`references/billing.md`, `payments.md`, `security.md`, `tax.md` — READ the parts you touch).

## Decisions already made (do not reopen)

- Stripe **hosted Checkout** (`mode: 'subscription'`) + Stripe **Customer Portal** for cancel,
  card update, invoices and switching monthly/yearly. No card fields on Vibe, ever.
- One Product "Vibe+" with two Prices, found by **lookup key**: `vibe_plus_monthly` ($3.99/month),
  `vibe_plus_yearly` ($24.99/year), USD. No price ids in env or code.
- SDK `stripe` 22.6.x, pinned `apiVersion: '2026-08-26.dahlia'`. Always a client INSTANCE
  (`new Stripe(key, {...})`), never a global key.
- **Never pass `payment_method_types`.** No `automatic_tax` (no tax registration exists; turning it
  on collects nothing). No trials, no promotion codes in v1.
- **Webhooks drive the entitlement** (renewals, failed cards, cancellations happen after checkout).
  The success page ALSO syncs, idempotently, through the same function, so Vibe+ appears at once.
- **Resolve every event through Stripe's object graph**: subscription → `customer` →
  `billing_customers.user_id`. `metadata.vibe_user_id` is a fallback that must AGREE with the
  mapping when both exist; a disagreement is logged and nothing is written.
- **Always re-fetch the subscription** (`subscriptions.retrieve`) before writing, so events that
  arrive out of order can't roll state back.
- **Production stays off**: `BILLING_ENABLED` is unset on Vercel until the LLC has its EIN and bank
  account AND the Terms with subscription wording are published (Franky, 2026-09-22).
- A **comp** entitlement (Franky's) is never overwritten by a Stripe event: outcome `skipped_comp`.
- Refunds and disputes are **recorded, not acted on**: a refund alone doesn't stop next month's
  charge; Franky cancels in the Dashboard, which fires `customer.subscription.deleted`.
- Deleting a Vibe account **stops all future charges first** (`customers.del`), and fails closed.
- Standing DB rule: never REVOKE EXECUTE on a public function. This wave adds no functions.

## Environment (all server-only; never `NEXT_PUBLIC_`)

| Var | Meaning |
|---|---|
| `STRIPE_SECRET_KEY` | test key locally (`sk_test_`/`rk_test_`); a RESTRICTED live key on Vercel later |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for the webhook route |
| `BILLING_ENABLED` | exactly `"true"` turns on Subscribe + checkout; anything else = off |

Missing key → Stripe is "not configured": checkout/portal/webhook answer 503, /plus shows the
honest "not yet" state, account deletion fails closed only if a billing_customers row exists.

## A — Database: `supabase/migrations/20260922150000_billing_stripe.sql` (written; LOCAL only)

```sql
create table public.billing_customers (
  user_id            uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  livemode           boolean not null,
  created_at         timestamptz not null default now()
);
create table public.billing_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'stripe' check (provider = 'stripe'),
  provider_event_id text not null unique,
  type              text not null,
  livemode          boolean not null,
  object_id         text,        -- sub_/cs_/in_/ch_/dp_ the event is about
  user_id           uuid,        -- resolved Vibe user; NO FK (survives account deletion)
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  outcome           text check (outcome in ('applied','ignored','unmatched','skipped_comp','recorded','error')),
  error             text         -- short message, never a payload, key or email
);
```
RLS on, zero policies; `revoke all ... from anon, authenticated`; `grant all ... to service_role`
(+ the identity sequence). No payload column (no PII at rest). `entitlements` is NOT altered:
a Stripe row uses `source='stripe'`, `provider_ref = <subscription id>`.
House style of `20260922140000_hidden_club_content_rls.sql`: WHY header, pre-flight gate
(`20260922140000` present, own absent), in-transaction post-check incl. the standing-rule count,
ROLLBACK, `notify pgrst`.

## B — Library: `src/lib/billing/` (exact exports)

`config.ts` — pure, no `server-only`, no `@/` runtime imports (node --test loads it):
```ts
export type PlusPlan = "monthly" | "yearly";
export const PLUS_PRICE_LOOKUP: Record<PlusPlan, string>; // vibe_plus_monthly / vibe_plus_yearly
export const PLUS_PRICE_LABEL: Record<PlusPlan, string>;  // "$3.99" / "$24.99"
export const PLUS_PERIOD_LABEL: Record<PlusPlan, string>; // "a month" / "a year"
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
export const PAST_DUE_GRACE_DAYS = 7;
export function isPlusPlan(v: unknown): v is PlusPlan;
export function billingEnabled(env?: NodeJS.ProcessEnv): boolean; // BILLING_ENABLED==="true" && key set
export function stripeConfigured(env?: NodeJS.ProcessEnv): boolean; // key set
```
`entitlement-map.ts` — pure (type-only Stripe import):
```ts
export type EntitlementPatch = { tier: "plus"; status: "active"|"past_due"|"canceled"|"expired";
  source: "stripe"; provider_ref: string; started_at: string; current_period_end: string|null;
  grace_until: string|null; cancel_at_period_end: boolean; updated_at: string };
export type PriorEntitlement = { status: string|null; source: string|null; grace_until: string|null;
  current_period_end: string|null } | null;
export function entitlementFromSubscription(sub: Stripe.Subscription, prior: PriorEntitlement,
  now: Date): EntitlementPatch | null;  // null = write nothing (e.g. 'incomplete')
```
Mapping: `active`/`trialing` → active, grace null · `past_due` → past_due, grace =
prior grace if prior was past_due, else now+7d (never extended by repeat events) · `unpaid`,
`paused` → canceled, period end = now · `canceled` → canceled, period end = `ended_at` or now ·
`incomplete_expired` → expired · `incomplete` → null. `current_period_end` comes from the
subscription ITEM on dahlia (`items.data[0].current_period_end`), unix seconds → ISO.
`started_at` = `start_date`. `cancel_at_period_end` from the sub (also true when `cancel_at` set).

`stripe.ts` (`server-only`): `getStripe(): Stripe | null` (singleton, pinned version,
`appInfo: { name: "Vibe" }`, `maxNetworkRetries: 2`) · `getPlusPriceId(plan): Promise<string>`
(prices.list by lookup key, active only, cached 10 min in module; throws `BillingConfigError`).

`customers.ts` (`server-only`): `getOrCreateStripeCustomer(userId): Promise<string>` (mapping
first; else `customers.create({ metadata: { vibe_user_id } }, { idempotencyKey:
"vibe-customer-" + userId })`, insert mapping; on unique conflict re-read and use the stored one)
· `userIdForStripeCustomer(customerId): Promise<string|null>` · `stripeCustomerForUser(userId):
Promise<string|null>`. Service role for every read/write.

`sync.ts` (`server-only`):
```ts
export type SyncOutcome = "applied" | "ignored" | "unmatched" | "skipped_comp";
export function syncSubscriptionById(subId: string): Promise<{ outcome: SyncOutcome; userId: string|null }>;
export function syncCheckoutSession(sessionId: string, expectedUserId: string):
  Promise<{ outcome: SyncOutcome | "mismatch" | "unpaid"; userId: string|null }>;
```
`syncCheckoutSession` refuses (`mismatch`) unless the session's customer maps to
`expectedUserId`; syncs only when `mode==='subscription'` and `payment_status` is `paid` or
`no_payment_required`. Writes are an upsert on `entitlements(user_id)` with the service role;
a prior row with `source='comp'` that `isPlusActive` → `skipped_comp`, nothing written.

`webhook.ts` (`server-only`):
```ts
export type HandledEvent = { outcome: SyncOutcome | "recorded"; userId: string|null; objectId: string|null };
export function handleStripeEvent(event: Stripe.Event): Promise<HandledEvent>;
```
Routing: `checkout.session.completed` + `checkout.session.async_payment_succeeded` → if paid,
`syncSubscriptionById(session.subscription)` · `checkout.session.async_payment_failed` → ignored ·
`customer.subscription.{created,updated,deleted,paused,resumed}` → `syncSubscriptionById(sub.id)` ·
`invoice.paid`, `invoice.payment_failed` → subscription id from
`invoice.parent?.subscription_details?.subscription` → sync (none → ignored) ·
`charge.refunded`, `charge.dispute.created` → `recorded` (user via customer; `console.error` for
disputes) · anything else → ignored. Throws only on Stripe/DB failure (route answers 500 → retry).

Tests (node --test, no network): `entitlement-map.test.ts` (every status, grace not extended,
item period end, cancel_at) and `config.test.ts`.

## C — Routes

`POST /api/billing/checkout` body `{ plan: "monthly"|"yearly" }`. Order: auth (401) →
`billingEnabled()` else 503 `{ok:false, code:"billing_off"}` → validate plan (400) →
`requireTermsAccepted` (403 terms_required) → already Plus (`getEntitlement` + `isPlusActive`)
409 `{ok:false, code:"already_plus"}` → `rateLimit("billing-checkout:"+uid, 10/600s)` (429) →
customer → `checkout.sessions.create({ mode:"subscription", customer, client_reference_id: uid,
line_items:[{ price, quantity:1 }], success_url: SITE+"/plus?checkout=success&session_id=
{CHECKOUT_SESSION_ID}", cancel_url: SITE+"/plus?checkout=canceled", metadata:{vibe_user_id},
subscription_data:{ metadata:{vibe_user_id} }, integration_identifier:"vibe_plus_web_"+8 random
lowercase letters, custom_text:{ submit:{ message: <auto-renew line for the plan> } } })` →
200 `{ ok:true, url }`. Stripe failure → 502 `{ok:false, code:"stripe_error"}` (logged without
secrets). SITE from `src/lib/auth/site-url.ts`, never a raw Host header.

`POST /api/billing/portal` → auth → `stripeConfigured()` else 503 → mapping else 404
`{ok:false, code:"no_customer"}` → `rateLimit("billing-portal:"+uid, 20/600s)` →
`billingPortal.sessions.create({ customer, return_url: SITE+"/plus" })` → `{ ok:true, url }`.
Works with BILLING_ENABLED off (a subscriber must always be able to cancel).

`POST /api/billing/webhook` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`): not configured →
503 · raw body `await req.text()` · `webhooks.constructEvent(body, sig, secret)` else 400 ·
insert `billing_events` (on conflict: already processed → 200 `{received:true, duplicate:true}`;
unprocessed → reprocess) · `handleStripeEvent` · update processed_at/outcome/user_id/object_id ·
200 `{ received:true }`; on throw → store short error, 500.

`DELETE /api/me` (existing route): before any purge or `deleteUser`, if a billing_customers row
exists → `customers.del(id)` (cancels every subscription now, no refund); `resource_missing` =
already gone → continue; Stripe not configured or any other failure → 503
`{ ok:false, error:"We couldn't close your Vibe+ subscription, so your account wasn't deleted. Try again in a few minutes." }`.

## D — `/plus` (`src/app/plus/page.tsx` server + `src/app/plus/PlusActions.tsx` client)

Server reads user, `getEntitlement`, `billingEnabled()`, `?checkout` and `?session_id`. On
`checkout=success` with a session id and a user → `syncCheckoutSession` (errors never break the
page), then re-read the entitlement. States: signed out · billing off (today's honest copy) ·
can subscribe (two plan cards → POST checkout → `location.assign(url)`) · Plus via Stripe
(renews/ends date, Manage subscription → POST portal) · past_due in grace (update-card banner +
Manage) · comp ("Your Vibe+ is complimentary"). Banners: success ("Welcome to Vibe+." or
"Payment received. Vibe+ turns on as soon as Stripe confirms — refresh in a moment.") and
canceled ("Checkout canceled. You weren't charged."). Disclosure next to Subscribe (plain):
renews automatically at the price per period until you cancel; cancel anytime in Manage
subscription and keep Vibe+ to the end of the paid period; link to /terms. Refusals use the house
`vibeRequest` / `describeFailure` toasts. Fix the stale "Likes … any signed-in student can already
read those" line (who-liked has been private since session 63). Phone layout must work (the page
already has the phone tab bar).
