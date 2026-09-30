# Vibe — paywall and monetization

**Status:** design, nothing built. Written 2026-09-12 against `main` @ `48aa5b8`, latest migration `20260911100000`.

---

## 1. The platform question (decide this first — it's the expensive one)

### Where Vibe is today

- A Next.js 16 app on Vercel. **No native wrapper exists**: `package.json` has no capacitor, expo, or react-native dependency.
- Every viewport under 900px already gets React components from `src/components/mobile/` — students on iPhones use Safari and get a real product today.
- iOS is on the roadmap but gated: `DOCS/ROADMAP.md:11` lists "Before app-store submission: CSP, throttles, proxy-trusted clientIp, Sentry PII scrub, live pentest, Apple prerequisites (in-app deletion, privacy labels, age rating)." None of that is done.

### What each path costs

| | Stripe (web) | Apple IAP (iOS) |
|---|---|---|
| Cut | Standard US card rate ~2.9% + $0.30 (verify at signup; Stripe Billing may add a recurring % on top) | 30% standard; **15% under the Small Business Program** (<$1M proceeds/yr — Vibe qualifies trivially), and 15% on year-2+ subscriptions regardless |
| On $3.99/mo | ≈ $3.55 net | ≈ $3.39 net |
| On $24.99/yr | ≈ $23.97 net | ≈ $21.24 net |
| Fixed cost to start | $0 | **$99/yr Apple Developer Program — not in `DOCS/FINANCES.csv`** |
| Work | checkout session + webhook | StoreKit 2 + App Store Server Notifications v2 + a native app that doesn't exist |

### What Apple forbids

- **Guideline 3.1.1** — if the app unlocks features, subscriptions or premium content, you *must* use in-app purchase. It explicitly names license keys and redemption codes as not allowed. You cannot ship an iOS app that only honors a web purchase.
- **Guideline 3.1.3(b) (multiplatform services)** — you *may* let users access what they bought on your website inside the app, **provided those items are also available as in-app purchases within the app**. That's the clause that makes web-first safe later: honor the web sub *and* offer the IAP.
- **US storefront only**, since May 2025: external purchase links and buttons without an entitlement. Other storefronts still require IAP or a regional entitlement. And this is unstable — the Ninth Circuit vacated the complete commission ban in Dec 2025 and remanded; Apple has proposed 15%/10%/5% on external purchases; SCOTUS granted cert June 2026. **Assume link-out eventually carries a commission.**

### Recommendation

**Ship Stripe on the web now. Add StoreKit IAP only when the iOS app is real, and price so a 15% Apple cut still works.**

Why: it's reversible in the direction you'd want. Web-first → add IAP later is a normal 3.1.3(b) setup. IAP-first → move to web is not: you've already given Apple 15% of those cohorts, pinned your price to Apple's tiers, and an Apple price change requires subscriber consent and can cancel the subscription.

**Do not** design a business that needs the US link-out to stay commission-free.

---

## 2. Pricing

**Reference points.** Snapchat+ is $3.99/month or $39.99/year in the US, ~25M subscribers, 30+ perks, and its headline feature is *"see who rewatched your Story"* — which is exactly Vibe's "counts public, identities private" line in someone else's product. Snapchat also runs a ~$10/mo Platinum tier whose main draw is fewer ads (irrelevant — Vibe has no ads).

**What a US college student actually pays.** $3–6/month for something they open daily. Spotify student is $5.99. Snapchat+ is $3.99. Nobody pays $10 for a campus app.

### Recommendation: **Vibe+, $3.99/month or $24.99/year**

- **$3.99 monthly** matches Snapchat+ exactly. Students already price-compare against it, and matching the number removes the argument.
- **$24.99 annual** (~48% off, $2.08/mo effective) is deliberately aggressive. On a $3.99 charge, Stripe's $0.30 fixed fee is 7.5%; on $24.99 it's 1.2%. Annual conversion is what makes a $4 product survive its own payment processing, and it takes churn out of a solo founder's hands during a pilot.
- Both survive Apple's 15%: $3.39 and $21.24 net.
- **Set it once.** A Stripe price increase on existing subscribers requires notice; an Apple one requires consent and can cancel the sub.

### One-off unlocks: **not in v1**

A one-off catalog means a product table, a purchase ledger, per-item entitlement resolution, per-item refunds, and Apple non-consumable IAP products — four times the plumbing for the same dollar, and every one of them is a new place to be dishonest. One subscription resolving to one boolean is the cheapest thing that can be correct. Revisit after there are paying subscribers.

### No free trial in v1

Trials need a card on file, a trial-end webhook, and a dunning path. The free tier *is* the trial: counts are free forever, names are paid.

---

## 3. What Vibe+ sells

### 3a. Identities (the metrics half) — what the data actually supports

| Signal | Table | Rows today | Who can read it | Sellable? |
|---|---|---|---|---|
| Who viewed your profile | `profile_views(profile_user_id, viewer_user_id, viewed_on, referrer, first_viewed_at)` | **25**, of which **24 carry a referrer** | RLS `profile_views_owner_select USING (auth.uid() = profile_user_id)` — owner only | **Yes.** The referrer is the differentiator: "someone found you from the campus map" is a sentence the big networks can't say. |
| Who viewed a post | `post_views(post_id, user_id, viewed_on)` | **149** | RLS enabled, **zero policies** (verified) — `authenticated` reads nothing. `creator-stats/route.ts:31-33` already uses the service client for exactly this reason | **Yes.** Most networks discard this. |
| Who liked | `post_likes(post_id, user_id, created_at)` | 11 | RLS `post_likes_select_authenticated USING true` — **already world-readable to any signed-in user through PostgREST** | **No.** Selling it would require revoking that grant, which breaks the feed's own like-state query at `src/app/api/feed/route.ts:380`. |
| Who commented | `post_comments` | 14 | public by nature — comments render with their author | **No.** Never sellable. |
| Audience by major/year | `users.major` / `users.year` | 1 of 8 users has a campus set | — | Not yet. Blocked on adoption, as the Sept 10 plan already said. |

**So the honest paid metrics SKU is two things: who viewed your profile (and where they came from), and who viewed each post.** The Sept 10 plan listed "who liked and who commented" as paid; the grants say otherwise. That's a correction, not a reversal.

### 3b. Customization (the student hook) — what exists to sell

- **8 cover gradients**, hardcoded at `public/html/profile.html:4150`, with a single default constant mirrored at `src/components/mobile/ProfileMobile.tsx:223`.
- Written through two routes that both accept **any** string starting with `linear-gradient`/`radial-gradient` up to 4000 chars: `src/app/api/me/profile/route.ts:146-156` and `src/app/api/me/profile-sync/route.ts:244-260`.
- `users.banner_gradient` is **in the `authenticated` UPDATE grant** (verified). See §5 — this is the enforcement problem.

**Candidate v1 paid customizations** (all cheap, all visible, none needing new infrastructure):

1. **More cover gradients** — 8 free, +16 paid, plus a two-colour custom builder. The catalog must live in **one** module imported by both routes and both clients, not copy-pasted.
2. **A profile accent colour** — scoped to the profile hero only, not the app chrome (coral `#FF5C35` is hardcoded across the design system).
3. **A "+" mark next to the handle.** This is the Snapchat+ move. One column, one render site, and it's the thing other students see — which is the whole point of buying customization.
4. **A second pinned post** (`users.pinned_post_id` exists and is singular).
5. **Waived handle-change cooldown** (`users.handle_changed_at` + the existing cooldown logic).

All of it belongs in **one new service-role-only column or table**, never scattered across already-granted `users` columns.

---

## 4. Entitlements — the data model

### Why a table, not columns on `users`

`users_select_authenticated USING (true)` (verified) means every authenticated user can SELECT every users row for whatever columns are granted. Entitlement columns on `users` would each need their own REVOKE to stay private, and a billing row carries a Stripe customer id, a subscription id, a period end and a source — none of which belong on a profile row that the whole campus can read.

The precedent is exact: `supabase/migrations/20260906120000_terms_acceptances.sql:56-60` — RLS on, **no policies**, `REVOKE ALL ON TABLE ... FROM anon, authenticated`. Service-role only. Copy it.

### Schema

```sql
-- supabase/migrations/2026MMDD000000_entitlements.sql
create table public.entitlements (
  user_id                       uuid primary key references public.users(id) on delete cascade,
  tier                          text not null default 'free' check (tier in ('free','plus')),
  status                        text not null check (status in ('active','past_due','canceled','expired')),
  source                        text not null check (source in ('stripe','apple','comp')),
  stripe_customer_id            text,
  stripe_subscription_id        text,
  apple_original_transaction_id text,
  current_period_end            timestamptz,
  grace_until                   timestamptz,
  cancel_at_period_end          boolean not null default false,
  started_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create unique index entitlements_stripe_sub_idx
  on public.entitlements(stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.entitlements enable row level security;   -- deliberately NO policies
revoke all on table public.entitlements from anon, authenticated;
```

Append-only ledger, same shape as `terms_acceptances`:

```sql
create table public.billing_events (
  id                bigint generated always as identity primary key,
  user_id           uuid references public.users(id) on delete set null,
  provider          text not null check (provider in ('stripe','apple')),
  provider_event_id text not null unique,     -- webhook idempotency key
  kind              text not null,            -- 'checkout.session.completed', 'invoice.paid', …
  payload           jsonb not null,
  received_at       timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on table public.billing_events from anon, authenticated;
revoke all on sequence public.billing_events_id_seq from anon, authenticated;
```

Two deliberate differences from `terms_acceptances`:
- `provider_event_id` is **unique** — Stripe retries webhooks, and a double-apply must be structurally impossible, not merely unlikely.
- `user_id` is `ON DELETE SET NULL`, not CASCADE — a refund or chargeback dispute can outlive the account, and the payload keeps the provider ids. **Flag for counsel**, don't assert it.

### "Is it on?" — one predicate, one place

```
active := tier = 'plus'
  AND (status = 'active' OR (status = 'past_due' AND grace_until > now()))
  AND (current_period_end IS NULL OR current_period_end > now())
```

**No cron job is needed for expiry.** It's a read-time comparison, so a canceled-at-period-end subscriber keeps access until the period actually ends, and nothing expires late because a job didn't run. Say this out loud in the code comment so nobody adds a scheduler.

### The helper — `src/lib/billing/require-plus.ts`

Mirrors `src/lib/legal/require-terms.ts` line for line:

```ts
import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export function plusRequiredResponse() {
  return NextResponse.json(
    { ok: false, error: "Vibe+ required", code: "plus_required" },
    { status: 403 },
  );
}

/** Never throws. An error is NOT premium — this fails CLOSED. */
export async function getEntitlement(userId: string): Promise<Entitlement> { … }

/** Returns the response to send, or null when the caller may proceed. */
export async function requirePlus(userId: string): Promise<NextResponse | null> { … }
```

**Fail closed, on purpose, and unlike the rate limiter.** `src/lib/rate-limit.ts:11-12` documents that it fails *open* — "if the RPC errors we log and allow the request rather than taking the product down." That's right for a limiter and wrong for an entitlement: a limiter failing closed takes the product down, an entitlement failing open gives the product away. Put that contrast in the comment so the next person doesn't "fix" it.

### The client's honest locked state

**The rule: show the real count, lock where the names would be. Never a blurred fake name, never a placeholder avatar, never a number that isn't real.**

And critically — **the server must not send the names at all.** Today `/api/me/profile-views/route.ts:91-104` returns the full `recent[]` to everyone and stamps `premium: false`, expecting the client to blur it. Blurring client-side leaves the identities sitting in the network response: that's a privacy failure, not just a paywall hole. The free response must omit `recent` entirely and send `locked_count` instead.

`src/components/otto/OttoMetrics.tsx:188-192` already renders the honest teaser line; it becomes a real lock with the real count.

Failure copy, added after the `terms_required` rule at `src/lib/feedback/failure-copy.ts:105` **and** its static twin at `public/html/_persistence.js:134` (the file header says "Change both together"):

```ts
if (status === 403 && code === "plus_required") {
  return {
    message: "That's a Vibe+ feature.",
    action: { label: "See Vibe+", href: `/plus?next=${next}` },
  };
}
```

### Grace, expiry, refunds, chargebacks

- **Grace:** `status='past_due'` keeps access until `grace_until` = +7 days. Stripe's own retry schedule runs ~2 weeks; 7 days is deliberately shorter so a dead card doesn't hold a paid feature for a fortnight. Show a banner — don't silently degrade.
- **Expiry:** read-time, as above.
- **Refund** (`charge.refunded`): set `status='canceled'`, `current_period_end = now()`. No self-serve refund flow in v1 — Franky refunds from the Stripe dashboard and the webhook reconciles.
- **Chargeback** (`charge.dispute.created`): revoke immediately, no grace.
- **Cancel / update card:** link to Stripe's hosted Billing Portal. Don't build a cancel UI — the portal is free and is also the receipts and invoice surface.

### What happens to customizations when someone stops paying — **product decision**

Three options: **(a)** revert to free defaults · **(b)** keep them forever · **(c)** freeze them — they stay visible, but you can't change to another paid option, and picking a free one is a one-way door.

**Recommendation: (c), frozen.** Reverting punishes a paying customer at the exact moment they're most annoyed and makes the product feel like it confiscated something. Keeping them forever deletes the reason to keep paying. Frozen is the honest description of what they bought: the profile stays as they left it, and what lapsed is the *ability to change it*.

Implementation: **reads never gate** (the gradient renders for everyone, always), **writes gate** (`requirePlus` on the paid-option write path). And when a lapsed user is about to overwrite a paid customization with a free one, the UI must say so in one line first — a silent one-way door is the same class of bug as a silent failure, which this codebase spent all of Session 57 removing.

---

## 5. Enforcement — every gate server-side

The rule this repo already lives by, from `supabase/migrations/20260906130000_consent_db_boundary.sql:6-10`: *"grants, not routes, are the boundary — an authenticated session can still write straight through PostgREST with its own JWT, skipping every route gate."* Premium needs both layers.

### Layer 1 — route gates (all call the one helper)

| Route | File | What's gated |
|---|---|---|
| `GET /api/me/profile-views` | `src/app/api/me/profile-views/route.ts:91-104` | counts free; **omit `recent[]`** unless plus |
| `GET /api/me/posts/[id]/views` | new | who viewed one post — service client (post_views has 0 policies) |
| `GET /api/me/creator-stats` | `src/app/api/me/creator-stats/route.ts` | stays free in v1; only future breakdowns gate |
| `PATCH /api/me/profile` | `src/app/api/me/profile/route.ts:146-156` | paid gradients / accent |
| `POST /api/me/profile-sync` | `src/app/api/me/profile-sync/route.ts:244-260` | same fields, static-desktop twin — **both or neither** |
| `POST /api/me/handle` | `src/app/api/me/handle/route.ts` | waived cooldown |
| `GET /api/me/entitlement` | new | the client's single source of truth |
| `POST /api/billing/checkout` | new | auth + `requireTermsAccepted` + `rateLimit` |
| `POST /api/billing/webhook` | new | **signature only, no auth** |

Call order in every gated route matches the existing convention (`src/app/api/posts/[id]/comments/route.ts:3-4,48`): `getUser()` → `requireTermsAccepted()` → `rateLimit()` → `requirePlus()`.

### Layer 2 — grants

**This is the part that's easy to skip and fatal to skip.**

1. `REVOKE UPDATE (banner_gradient) ON public.users FROM authenticated;` — verified today as **granted**, so a route-only gate on paid gradients is bypassable with a plain `PATCH /rest/v1/users?id=eq.<uid>`. Exactly the hole closed for `otto_answers` in `20260906110000`. The write then goes through the service client, which both routes already import.
2. New customization state goes in a **service-role-only** column or table from the start.
3. `entitlements` and `billing_events`: RLS on, **no policies**, all privileges revoked from anon and authenticated.

### Do NOT add a `has_plus()` SECURITY DEFINER to RLS policies in v1

`has_recorded_consent()` exists because consent is a **write** boundary on tables users write directly. Premium is a **read** boundary on tables users already cannot read — `post_views` has zero policies, `profile_views` is owner-only. The route gate plus the service-role read *is* the boundary, and an RLS function would be a second thing to keep in sync with the first. Stating this explicitly so nobody adds it "for symmetry".

### Webhook hardening

- Verify the Stripe signature against the **raw** body (`await req.text()`, never `req.json()`).
- Reject unsigned. Rate-limit it.
- **Never trust `client_reference_id` alone for identity** — bind the Stripe customer to the user id when the checkout session is created, and store it on `entitlements`.
- Idempotent via `billing_events.provider_event_id`.

### Never trust the client for entitlement

`public/html/_persistence.js:526-528` merges `d.vibeUser` from `/api/me/profile-bootstrap` into `localStorage['vibe_user_v1']`. A student can edit that in devtools. A client-side `plus` flag may control **rendering of the upsell only** — never access to data. The data must already be absent from the response.

---

## 6. What NOT to sell

Name these so nobody gates them by accident.

1. **Safety.** Block (`/api/me/block`), mute (`/api/me/mute`), report (`/api/me/reports`), and the blocked-users list in Settings (`SettingsClient.tsx:237`). Blocking is an app-store requirement and principle 06 in the journal.
2. **Account deletion.** `DELETE /api/me` — its own comment says "required for legal compliance." `src/app/settings/page.tsx:32-34` deliberately has **no consent gate** so someone who declines the Terms can still delete. A paywall must be equally absent.
3. **The Terms flow.** `/auth/terms`, `POST /api/me/accept-terms`.
4. **Your own data.** Your posts, DMs, resume, and any export of what you made.
5. **Counts.** Principle 05 says counts are public. Charging someone for *their own* follower count sells back the thing that's already visible on everyone else's profile.
6. **Basic messaging.** DMs are the spine; gating sends turns a social network into a demo.
7. **School verification.** `/auth/school-email` is the identity gate — charging for it charges for being a student.
8. **Anything that makes you harder to hold accountable.** No "hide that I viewed your profile", no anonymous posting, no "see who blocked you." This is where premium tiers drift, and it's worth naming because *Snapchat+ does sell this shape of thing* (rewatch indicators). Vibe's version must never invert someone else's privacy to reward a payment.
9. **Notifications about things that happened to you.**

---

## 7. Sequencing

### Phase 0 — ships before a dollar moves (all reversible; all useful even if payments never launch)

1. `entitlements` + `billing_events` migrations. No provider yet.
2. `src/lib/billing/require-plus.ts` + `GET /api/me/entitlement`.
3. The `plus_required` copy rule in **both** failure-copy files.
4. `/api/me/profile-views` stops sending `recent[]` to free users; `OttoMetrics` renders the honest lock with the real count. **This is the one user-visible takeaway before payments exist — and it's the right one**, because it turns "here's the paid feature, free, labelled soon" into an honest free tier.
5. `/plus` — an honest coming-soon page: the price, what's included, what will never be included, and a notify-me that writes a flag. **No fake checkout button.**
6. `REVOKE UPDATE (banner_gradient)` + service-client write.
7. A `source='comp'` path so Franky can grant himself and testers Vibe+ with one SQL insert and actually see the paid UI before Stripe exists.

### Phase 1 — blocked on the LLC's payment setup

8. **Stripe account for CONNECTVIBE. LLC.** Per Stripe's own published requirements for a US business: a US-formed entity, a **federal EIN** verified against an IRS CP 575 or 147C letter, a verifiable US business address, a description of what's sold, and a **bank account in the LLC's legal name**. Typical review 3–10 business days. *This is a description of Stripe's onboarding, not legal advice.* Franky should confirm with James (who filed the LLC, Business ID 202605081999327) whether the EIN and a business bank account exist — **neither appears in `DOCS/FINANCES.csv`**, and they are the long poles.
9. Products + prices in Stripe; `POST /api/billing/checkout`; `POST /api/billing/webhook`; a Billing Portal link.
10. **Sales tax.** Digital subscriptions are taxable in several US states. Stripe Tax exists. Flag, don't advise.
11. **Legal copy must change before the first charge.** The current privacy draft says, at `handoffs/legal-drafts/2026-09-07-privacy-policy.md:82`: *"No date of birth, government ID, phone number, or payment details."* That becomes false on day one. And the ToS draft has **no payments, refunds, cancellation or auto-renewal section at all** (verified by grep). Auto-renewal disclosure is separately regulated in several states. Cheapest thing to forget, most expensive to get wrong.

### Phase 2 — iOS

12. Apple Developer Program ($99/yr — **not in FINANCES.csv**), StoreKit 2, an auto-renewable subscription at price parity, App Store Server Notifications v2 writing to the same `billing_events` with `source='apple'`.
13. Honor web purchases under 3.1.3(b) **and** offer the IAP. Both, or App Review rejects under 3.1.1.

---

## 8. Expensive or irreversible — flagged

- **Taking money at all.** Once real money moves you inherit refunds, chargebacks, tax and consumer-protection obligations. It is not a feature flag you can turn off.
- **IAP-first.** Reversible in one direction only. Stripe-first → add IAP is routine; IAP-first → move to web means you already gave away 15% on those cohorts and pinned your price to Apple's tiers.
- **The price.** Increases require notice on Stripe and subscriber consent on Apple (which can cancel the sub). Set it once.
- **`REVOKE UPDATE (banner_gradient)`** will break any client that PATCHes it directly. Verify with an anon/authenticated curl before and after, the way the `src/proxy.ts` gates were verified.
- **Removing `recent[]` from `/api/me/profile-views`** takes something away from the founder's own account, which is the only one with data. Expected, and worth doing knowingly.
- **`billing_events` retention vs. account deletion.** `DELETE /api/me` purges storage and cascades rows. Financial records may need to outlive an account. `ON DELETE SET NULL` is the proposal; counsel decides.

---

## 9. Honest state of the market (measured, not guessed)

| Metric | Value |
|---|---|
| Users | **8** (all 8 school-verified) |
| Users with a campus set | **1** |
| Active in last 7 days | **1** |
| Profile-view rows | **25** (24 carry a referrer) |
| **Distinct people who have ever viewed a profile** | **4** |
| Users with ≥3 profile views | 4 |
| Post-view rows | 149, from **4 distinct viewers** |
| Posts / likes / comments | 25 / 11 / 14 |
| Orgs / org members | 5 / 7 |
| Consent records | 1 |

Current burn, from `DOCS/FINANCES.csv`: ~$125/month (Claude Max $100, Supabase Pro $25), plus domain. At $3.99/month net ~$3.55, **35 paying students covers the entire infrastructure bill.** That's the real target, and it's reachable — but not with 8 accounts and 4 people who have ever looked at anybody.

**The build order this implies:** plumbing now (it's cheap, it makes the free tier honest, and `comp` lets you see the paid UI), Stripe when there are students.