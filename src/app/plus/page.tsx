import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { isSafeRelativePath } from "@/lib/auth/login-next";
import {
  PLUS_PERIOD_LABEL,
  PLUS_PRICE_LABEL,
  billingEnabled,
  stripeConfigured,
} from "@/lib/billing/config";
import { stripeCustomerForUser } from "@/lib/billing/customers";
import { syncCheckoutSession } from "@/lib/billing/sync";
import { appShellFromRequest } from "@/lib/native/server";
import { getEntitlement, type Entitlement } from "@/lib/premium/require-plus";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PlusActions, type PlanCard } from "./PlusActions";

/**
 * /plus — what Vibe+ is, what it costs, and, once sales are on, where you buy
 * it and where you cancel it.
 *
 * Design: handoffs/2026-09-12-design-paywall-monetization.md §7.
 * Contract: handoffs/wave-plan-stripe/contract.md §D.
 *
 * Money only moves on Stripe's own pages. Subscribe opens Stripe's hosted
 * Checkout and Manage subscription opens Stripe's Customer Portal
 * (PlusActions.tsx); this page never sees a card. It still COLLECTS NOTHING
 * and PROMISES NOTHING IT CANNOT DO: no email capture, no "notify me", and
 * the customization line stays "nothing here is charged for until it exists".
 *
 * What the reader sees, decided on the server in this order:
 *   - Signed out: the explanation and the price, nothing to press.
 *   - Couldn't check: the entitlement read failed, so the page says so and
 *     offers NO button. It won't sell Vibe+ to someone who may already have it.
 *   - Sales off (BILLING_ENABLED isn't "true", which is production until the
 *     LLC can take money): not on sale, no checkout, nowhere to enter a card.
 *   - Can subscribe: two plan cards, each with its renewal line, and the
 *     cancel / delete-account / Terms disclosure under them.
 *   - Vibe+ through Stripe: the renew or end date, and Manage subscription.
 *   - Card failed (past_due, in grace or past it): an update-your-card banner
 *     and Manage subscription, never the plan cards. Checkout refuses a second
 *     subscription (409 already_subscribed), so cards there would be a loop.
 *   - Complimentary.
 *   - Ended (canceled, or set to cancel and past its period): the free plan,
 *     and the plan cards if sales are on.
 * Manage subscription shows whenever Stripe is configured and the reader has
 * a Stripe customer, sales on or off: switching sales off must never trap a
 * subscriber who wants to cancel.
 *
 * Inside the App Store / Google Play app (handoffs/wave-plan-pwa/plan.md §5
 * SD1) Vibe+ isn't for sale, and the page shows no price, no plan cards, no
 * "not on sale yet" promise and none of the pitch below the plan line.
 * Members (Vibe+ now, or a Stripe subscription still running) see their plan
 * and Manage subscription, since stopping a subscription must work from
 * anywhere; everyone else gets one neutral line. Checkout refuses the app
 * too (403 store_app). Decided here on the server, so a price never paints
 * for a frame and then vanishes.
 *
 * Back from Checkout (?checkout=success&session_id=cs_…) the page syncs that
 * session through the same function the webhook uses (at most 10 times per
 * account per 10 minutes, since each sync spends Stripe requests), then reads
 * the entitlement. The banner comes from that answer, never from the URL:
 * anyone can type ?checkout=success, and a session id could be someone else's
 * link. If the sync itself fails, the page claims nothing about the session
 * but holds back the plan cards and says a payment couldn't be confirmed yet.
 *
 * Server component on purpose: everything dynamic is the reader's own
 * entitlement and billing state, read server-side, so there is nothing to
 * fetch from the client and no locked state that could flash unlocked first.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vibe+ · Vibe",
  description: "What Vibe+ includes, what it costs, and how to subscribe or cancel.",
};

const PAGE_BG =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

const SANS = "DM Sans, sans-serif";
const SERIF = "Fraunces, serif";
const CORAL = "#FF5C35";

/**
 * The shape of a Checkout Session id. Anything else is dropped before Stripe
 * is called, so a hand-typed or junk `session_id` costs nothing.
 */
const CHECKOUT_SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,200}$/;

/**
 * Success-page syncs per account. Each one is one to three Stripe calls on
 * the account's shared request budget, the same budget Subscribe, Manage
 * subscription and the webhook draw on, so a script reloading this URL must
 * not be able to spend it. A student back from Checkout refreshes a few times
 * at most; the checkout route allows 10 per 10 minutes too.
 */
const SYNC_LIMIT = { limit: 10, windowSec: 600 };

type SyncResult = Awaited<ReturnType<typeof syncCheckoutSession>>["outcome"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 21,
          fontWeight: 800,
          color: "#1C1C1E",
          letterSpacing: "-0.01em",
          margin: "0 0 10px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 7 }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Coral for "read this first" (not on sale, card failed); calm for news. */
function Banner({ tone, children }: { tone: "coral" | "calm"; children: ReactNode }) {
  const coral = tone === "coral";
  return (
    <div
      style={{
        border: coral ? `1px solid ${CORAL}` : "1px solid rgba(28,28,30,0.12)",
        background: coral ? "rgba(255,92,53,0.07)" : "rgba(255,255,255,0.72)",
        borderRadius: 16,
        padding: "16px 18px",
        fontFamily: SANS,
        fontSize: 14.5,
        lineHeight: 1.6,
        color: "#2A2620",
      }}
    >
      {children}
    </div>
  );
}

/** One string from a search param: Next hands over an array when a key repeats. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * "October 22, 2026" on the Indianapolis calendar. The server renders in UTC,
 * so a period ending at 11pm Eastern would otherwise print as the next day.
 */
function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "$24.99" a year as "$2.08" a month; null when the label isn't a plain dollar price. */
function perMonth(yearly: string): string | null {
  const m = /^\$(\d+)\.(\d{2})$/.exec(yearly.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number(m[2]);
  return `$${(cents / 1200).toFixed(2)}`;
}

/**
 * What a failed Stripe or database call is logged as: its class and code,
 * never its message. Stripe's authentication error quotes part of the key
 * ("Invalid API Key provided: sk_test_****abcd"), and no part of a key
 * belongs in a log.
 */
function errorLabel(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown error";
  const e = err as { type?: unknown; name?: unknown; code?: unknown };
  const kind = typeof e.type === "string" ? e.type : typeof e.name === "string" ? e.name : "Error";
  return typeof e.code === "string" ? `${kind} (${e.code})` : kind;
}

/**
 * Back from Checkout: sync that session for this reader. Null when there was
 * nothing to sync (no id, a junk id, Stripe not configured, over the limit),
 * "failed" when the sync threw. Never throws: a Stripe hiccup must not take
 * the page down. A limited load just skips the sync and reads the
 * entitlement as it stands, which by then the webhook has written.
 */
async function syncArrival(
  sessionId: string | undefined,
  userId: string,
): Promise<SyncResult | "failed" | null> {
  if (!sessionId || !CHECKOUT_SESSION_ID.test(sessionId) || !stripeConfigured()) return null;
  const rl = await rateLimit(`billing-sync:${userId}`, SYNC_LIMIT);
  if (!rl.allowed) return null;
  try {
    return (await syncCheckoutSession(sessionId, userId)).outcome;
  } catch (err) {
    console.error("[plus] checkout sync failed:", errorLabel(err));
    return "failed";
  }
}

/**
 * The banner after Checkout, from what the sync said AND what the entitlement
 * says now. "mismatch" (the session maps to another account), "unmatched"
 * and a skipped sync say nothing at all: the link may not be the reader's,
 * and "Welcome" on a stranger's link would be a lie. "failed" (Stripe or the
 * database hiccupped) claims nothing about the session either, but a student
 * who has just paid must not be told "free plan" with the plan cards back, so
 * it gets a neutral line that holds for anyone who landed here.
 */
function arrivalLine(arrival: SyncResult | "failed" | null, plus: boolean): string | null {
  switch (arrival) {
    case "failed":
      return plus
        ? null
        : "We couldn't confirm a payment just now. If you just subscribed, Vibe+ turns on as soon as Stripe confirms. Refresh in a moment to check.";
    case "applied":
    case "ignored":
      return plus
        ? "Welcome to Vibe+."
        : "Payment received. Vibe+ turns on as soon as Stripe confirms, refresh in a moment.";
    case "unpaid":
      return "Your payment is still processing. Vibe+ turns on when it clears.";
    case "skipped_comp":
      // A comp row is never overwritten by Stripe, so this payment isn't
      // tracked anywhere and would renew silently. Say so plainly.
      return "Payment received, but your Vibe+ is already complimentary. Cancel the paid plan under Manage subscription so you aren't charged again.";
    default:
      return null;
  }
}

type Status = { tone: "line" | "calm" | "coral"; body: ReactNode };

/**
 * The reader's plan, in words, for a signed-in reader. `inApp` drops the two
 * nudges toward paying more (switching plans, turning renewal back on): the
 * store apps don't sell Vibe+, and Manage subscription is there to stop or
 * fix a plan, not to grow one.
 */
function statusFor(e: Entitlement, manage: boolean, inApp: boolean): Status {
  if (!e.checked) {
    // The read failed. Saying "you're on the free plan" would be asserting
    // something we did not manage to look up.
    return { tone: "line", body: "Couldn't check your Vibe+ status just now. Refresh to try again." };
  }
  const end = formatDay(e.current_period_end);
  const stripe = e.source === "stripe";

  if (e.plus && e.source === "comp") {
    return {
      tone: "calm",
      body: (
        <>
          <strong>Your Vibe+ is complimentary.</strong>
          {end ? ` It runs until ${end}.` : null}
          {/* A customer row only means Subscribe was tapped once, not that a
              plan exists, so this says where to look and claims no charge.
              A payment made on top of a comp gets the skipped_comp banner. */}
          {manage ? " Started a paid plan too? Manage subscription shows it." : null}
        </>
      ),
    };
  }
  if (e.plus && stripe && e.status === "past_due") {
    const grace = formatDay(e.grace_until);
    return {
      tone: "coral",
      body: (
        <>
          <strong>Your last payment didn&apos;t go through.</strong> Update your
          card under Manage subscription to keep Vibe+.{" "}
          {grace
            ? `It stays on until ${grace} while the payment is retried.`
            : "It stays on for a few days while the payment is retried."}
        </>
      ),
    };
  }
  if (e.plus && stripe && e.cancel_at_period_end) {
    return {
      tone: "calm",
      body: (
        <>
          <strong>{end ? `You have Vibe+ until ${end}.` : "You have Vibe+."}</strong> It
          won&apos;t renew, so you won&apos;t be charged again.
          {inApp ? null : " Changed your mind? Manage subscription can turn renewal back on."}
        </>
      ),
    };
  }
  if (e.plus && stripe) {
    return {
      tone: "calm",
      body: (
        <>
          <strong>You have Vibe+.</strong> {end ? `It renews on ${end}. ` : null}
          {inApp
            ? "Cancel anytime under Manage subscription."
            : "Cancel or switch plans anytime under Manage subscription."}
        </>
      ),
    };
  }
  if (e.plus) return { tone: "line", body: "You have Vibe+." };

  if (stripe && e.status === "past_due") {
    // Grace ran out. Plan cards here would loop into checkout's 409
    // already_subscribed: the subscription still exists, it just isn't paid.
    return {
      tone: "coral",
      body: (
        <>
          <strong>Vibe+ is paused because your last payment didn&apos;t go
          through.</strong> Update your card under Manage subscription and it
          comes back once the payment goes through.
        </>
      ),
    };
  }
  // Ended: canceled or expired, or set to cancel with the period now over
  // (the deletion event is seconds behind, and the student chose this, so no
  // "renewal" talk). The plan cards may show; checkout's own Stripe check
  // refuses a second subscription while the old one is still live.
  const ended =
    e.status === "canceled" ||
    e.status === "expired" ||
    (e.status === "active" && e.cancel_at_period_end);
  if (stripe && ended) {
    // entitlement-map writes Stripe's "unpaid" and "paused" as canceled, but
    // Stripe still holds those subscriptions, and may still want a payment.
    // With Manage on the page, say where that would show.
    return {
      tone: "line",
      body: manage
        ? "Your Vibe+ has ended, so you're on the free plan. If a payment is still owed, Manage subscription shows it."
        : "Your Vibe+ subscription has ended, so you're on the free plan.",
    };
  }
  if (stripe && e.status === "active") {
    // The period end has passed and the renewal hasn't reached us yet; the
    // webhook is usually seconds behind. Not "free plan", and not plan cards.
    return {
      tone: "calm",
      body: "Your Vibe+ period just ended and the renewal hasn't been confirmed yet. Refresh in a moment, or check Manage subscription.",
    };
  }
  return { tone: "line", body: "You're on the free plan." };
}

const LINE_STYLE: CSSProperties = { fontFamily: SANS, fontSize: 13.5, color: "#5C5853", margin: "0 2px" };
const LINK_STYLE: CSSProperties = { color: "#5C5853", fontWeight: 700, textDecoration: "none" };

export default async function PlusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `?next=` comes from the failure-copy action ("See Vibe+"), so it is
  // attacker-influenced, and it becomes the "← Back" href below. Use the one
  // open-redirect gate the app already shares with every other `next`-style
  // param (login, auth callback, terms, onboarding) rather than a second,
  // weaker copy: a hand-rolled `startsWith("/") && !startsWith("//")` still
  // admits `/\evil.com`, which browsers resolve to https://evil.com/ because
  // a backslash is a slash in a special scheme. isSafeRelativePath rejects
  // that, plus whitespace and control characters, and re-checks with the URL
  // parser that the path really stays on this origin.
  const rawNext = firstParam(params.next);
  const back = isSafeRelativePath(rawNext) ? rawNext : null;
  const checkout = firstParam(params.checkout);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const enabled = billingEnabled();
  const configured = stripeConfigured();
  // The store apps, from the user agent the shell adds. Only ever used to
  // hide things; checkout makes the same check on its own.
  const inApp = (await appShellFromRequest()) !== null;

  // Sync BEFORE reading the entitlement, so the read sees what the sync wrote.
  const arrival =
    user && checkout === "success" ? await syncArrival(firstParam(params.session_id), user.id) : null;

  // Signed-out readers get the same page minus the plan line — this is a
  // public explanation of a price, not a gated surface.
  const entitlement = user ? await getEntitlement(user.id) : null;

  // A Stripe customer means there may be a subscription to manage, sales on
  // or off. A missing billing table (production before its migration) is "no
  // customer" inside stripeCustomerForUser; anything that throws hides the
  // button rather than the page.
  let hasCustomer = false;
  if (user && entitlement?.checked && configured) {
    try {
      hasCustomer = (await stripeCustomerForUser(user.id)) !== null;
    } catch (err) {
      console.error("[plus] billing customer lookup failed:", errorLabel(err));
    }
  }

  const plus = entitlement?.plus ?? false;
  const viaStripe = entitlement?.source === "stripe";
  // Stripe still has a subscription running (paid, or failing and being
  // retried), whatever the period end says. An active row set to cancel isn't
  // one once its period is over: that student chose to stop.
  const liveStripe =
    viaStripe &&
    ((entitlement?.status === "active" && !entitlement.cancel_at_period_end) ||
      entitlement?.status === "past_due");
  // Paid, or maybe paid (the sync threw), and Stripe hasn't confirmed yet: no
  // plan cards, or a second tap could buy twice. The arrival banner does the
  // talking.
  const awaiting =
    !plus &&
    (arrival === "unpaid" || arrival === "applied" || arrival === "ignored" || arrival === "failed");

  // Someone Vibe+ still applies to: on it now (comp, paid, or a failed card
  // in grace), or with a Stripe subscription still running and owed.
  const member = plus || liveStripe;

  const showManage = Boolean(
    user &&
      entitlement?.checked &&
      configured &&
      (hasCustomer || viaStripe) &&
      (!inApp || member),
  );
  const showPlans = Boolean(
    enabled && !inApp && user && entitlement?.checked && !plus && !liveStripe && !awaiting,
  );

  // In the app, anyone who isn't a member (signed out included) gets one
  // neutral line instead of their plan in words: "you're on the free plan"
  // with no way to change it reads as a pitch. Not while a payment is awaited
  // (the arrival banner is talking), and not when the read failed (that
  // line says so, and the reader may well be a member).
  const appNotice = inApp && !member && !awaiting && (!entitlement || entitlement.checked);

  const arrivalText = user ? arrivalLine(arrival, plus) : null;
  const status =
    entitlement && !awaiting && !appNotice ? statusFor(entitlement, showManage, inApp) : null;

  const yearlyPerMonth = perMonth(PLUS_PRICE_LABEL.yearly);
  const planCards: PlanCard[] = [
    {
      plan: "monthly",
      name: "Monthly",
      price: PLUS_PRICE_LABEL.monthly,
      period: PLUS_PERIOD_LABEL.monthly,
      renewal: `Renews automatically at ${PLUS_PRICE_LABEL.monthly} ${PLUS_PERIOD_LABEL.monthly} until you cancel.`,
    },
    {
      plan: "yearly",
      name: "Yearly",
      price: PLUS_PRICE_LABEL.yearly,
      period: PLUS_PERIOD_LABEL.yearly,
      note: yearlyPerMonth ? `Works out to about ${yearlyPerMonth} a month.` : null,
      renewal: `Renews automatically at ${PLUS_PRICE_LABEL.yearly} ${PLUS_PERIOD_LABEL.yearly} until you cancel.`,
    },
  ];

  const priceNote = (
    <p style={{ margin: 0, color: "#5C5853", fontSize: 14 }}>
      One subscription, one tier. No add-ons to buy separately, and no
      trial — the free tier is the trial, and the counts on it are free
      for good.
    </p>
  );

  return (
    <main style={{ minHeight: "100vh", background: PAGE_BG, padding: "48px 24px 80px" }}>
      {/* The classes go on this div, not <main>: main's inline padding
          would override a class, while this div's stacks on top of it. */}
      <div
        className={user ? "vibe-tabbar-page vibe-mobile-safe-top" : "vibe-mobile-safe-top"}
        style={{ maxWidth: 720, margin: "0 auto" }}
      >
        <p style={{ marginBottom: 24 }}>
          <Link
            href={back ?? "/campus"}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#5C5853", textDecoration: "none" }}
          >
            ← Back
          </Link>
        </p>

        {/* In the app the heading is just the name: the tagline and the
            line under it are the pitch. */}
        <header style={{ marginBottom: 22 }}>
          {inApp ? null : (
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#C84A20",
                marginBottom: 6,
              }}
            >
              Vibe+
            </div>
          )}
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(30px, 4vw, 42px)",
              fontWeight: 900,
              color: "#1C1C1E",
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
              lineHeight: 1.1,
            }}
          >
            {inApp ? "Vibe+" : <>See who&apos;s looking.</>}
          </h1>
          {inApp ? null : (
            <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: "#5C5853", margin: 0 }}>
              Vibe shows everyone how many people viewed their profile and their
              posts. Vibe+ is how you find out <em>who</em>.
            </p>
          )}
        </header>

        <div style={{ display: "grid", gap: 12 }}>
          {arrivalText ? <Banner tone="calm">{arrivalText}</Banner> : null}
          {user && checkout === "canceled" ? (
            <Banner tone="calm">Checkout canceled. You weren&apos;t charged.</Banner>
          ) : null}

          {/* The honest headline while sales are off. The reader learns that
              nothing here can take money before they read the price, not
              after. Not in the app: there is no price there, and "when it
              goes on sale, it goes on sale here" would be a promise about a
              purchase the app doesn't offer. */}
          {!enabled && !inApp ? (
            <Banner tone="coral">
              {showManage ? (
                <>
                  <strong style={{ fontWeight: 700 }}>Vibe+ isn&apos;t on sale right now,</strong>{" "}
                  so there&apos;s no checkout on this page. If you&apos;ve
                  subscribed before, Manage subscription below is where you
                  cancel, change your card or find your receipts.
                </>
              ) : (
                <>
                  <strong style={{ fontWeight: 700 }}>Vibe+ isn&apos;t on sale yet.</strong>{" "}
                  There is no checkout on this page and nowhere to enter a
                  card — this is the price and the feature list, published
                  early so the free tier can stop pretending. When Vibe+ goes
                  on sale, it goes on sale here.
                </>
              )}
            </Banner>
          ) : null}

          {appNotice ? (
            <p style={LINE_STYLE}>Vibe+ isn&apos;t available in the app.</p>
          ) : !user ? (
            <p style={LINE_STYLE}>
              <Link href="/auth/login?next=%2Fplus" style={LINK_STYLE}>
                Sign in
              </Link>{" "}
              to see which plan you&apos;re on{enabled ? " or to subscribe" : ""}.
            </p>
          ) : status?.tone === "line" ? (
            <p style={LINE_STYLE}>{status.body}</p>
          ) : status ? (
            <Banner tone={status.tone}>{status.body}</Banner>
          ) : null}

          {/* Exactly one PlusActions per page, so its one-request-at-a-time
              guard covers every button: here when there are no plan cards,
              under the plan cards when there are. */}
          {showManage && !showPlans ? <PlusActions manage /> : null}
        </div>

        {/* What Vibe+ is, what it costs and what it will never be. None of
            it renders in the store apps: the price is the thing SD1 rules
            out, and the rest is the pitch for it. */}
        {inApp ? null : (
          <article style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: "#2A2620" }}>
            <Section title="The price">
              {showPlans ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {priceNote}
                  <PlusActions
                    plans={planCards}
                    manage={showManage}
                    manageNote="Subscribed before? Your receipts and card are under Manage subscription."
                  >
                    {/* The disclosure sits right under the buttons it applies
                        to, in plain words, before anyone taps. */}
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#5C5853" }}>
                      Cancel anytime from Manage subscription on this page and
                      you keep Vibe+ to the end of the period you&apos;ve paid
                      for. Deleting your Vibe account cancels it right away, with
                      no refund for the rest of that period. Checkout and billing
                      run on Stripe, so Vibe never sees your card. The details
                      are in the{" "}
                      <Link href="/legal/terms" style={LINK_STYLE}>
                        Terms of Service
                      </Link>
                      .
                    </p>
                  </PlusActions>
                </div>
              ) : (
                <>
                  <p style={{ margin: "0 0 8px" }}>
                    <strong style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 900, color: "#1C1C1E" }}>
                      {PLUS_PRICE_LABEL.monthly}
                    </strong>{" "}
                    {PLUS_PERIOD_LABEL.monthly}, or{" "}
                    <strong style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 900, color: "#1C1C1E" }}>
                      {PLUS_PRICE_LABEL.yearly}
                    </strong>{" "}
                    {PLUS_PERIOD_LABEL.yearly}.
                  </p>
                  {priceNote}
                </>
              )}
            </Section>

            <Section title="What Vibe+ unlocks">
              <p style={{ margin: "0 0 10px", color: "#5C5853", fontSize: 14 }}>
                Three things the database already keeps private from everyone,
                including from us on the free tier:
              </p>
              <List
                items={[
                  <>
                    <strong>Who viewed your profile.</strong> You already see how
                    many. Vibe+ puts names to the number.
                  </>,
                  <>
                    <strong>Who viewed each of your posts.</strong> Most networks
                    throw this away. Vibe keeps it, and only Vibe+ shows it to
                    you.
                  </>,
                  <>
                    <strong>Who saved your posts.</strong> The quietest signal
                    there is, and usually the most useful one.
                  </>,
                  <>
                    <strong>More ways to make your profile yours</strong> — more
                    covers, an accent colour, and a mark next to your handle.
                    Still being built; nothing here is charged for until it
                    exists.
                  </>,
                ]}
              />
            </Section>

            <Section title="What stays free, always">
              <List
                items={[
                  <>
                    <strong>Every count.</strong> Profile views, post views,
                    likes, comments, followers. Counts are public on Vibe; we are
                    not going to sell you your own follower number.
                  </>,
                  <>
                    <strong>Comments and who follows whom.</strong> Any
                    signed-in student can already read those, so charging for
                    them would be a paywall over an open door. Who liked your
                    post shows up in your notifications on any plan, and no plan
                    lets anyone else see it.
                  </>,
                  <>Messages, posting, events, orgs and the campus map.</>,
                  <>
                    <strong>Blocking, muting and reporting.</strong> Safety is
                    never a paid feature.
                  </>,
                  <>School verification, and deleting your account.</>,
                ]}
              />
            </Section>

            <Section title="What Vibe+ will never include">
              <p style={{ margin: "0 0 10px", color: "#5C5853", fontSize: 14 }}>
                This is where paid tiers on other apps go wrong, so it is written
                down before there is money on the table:
              </p>
              <List
                items={[
                  <>
                    <strong>No hiding that you viewed someone.</strong> Paying
                    does not make you invisible to the exact feature you are
                    paying to use.
                  </>,
                  <>No anonymous posting, and no seeing who blocked you.</>,
                  <>
                    Nothing that makes a paying student harder to hold accountable
                    to everyone else.
                  </>,
                ]}
              />
            </Section>

            <Section title="Why the names disappeared">
              <p style={{ margin: 0 }}>
                Until September 12, Vibe showed every account the names of the
                people who viewed their profile, with a caption saying that would
                become a paid feature soon. That was the least honest arrangement
                available: the paid feature, given away, labelled as not-yet-paid.
                So the names went behind the lock before there was anything to
                buy, and the counts — which were always the free part — stayed
                untouched and exact.
              </p>
            </Section>
          </article>
        )}

        <p style={{ marginTop: 40, fontFamily: SANS, fontSize: 13, color: "#8A8580" }}>
          <Link href="/legal/terms" style={LINK_STYLE}>
            Terms of Service
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <Link href="/legal/privacy" style={LINK_STYLE}>
            Privacy Policy
          </Link>
          <span style={{ margin: "0 8px" }}>·</span>
          <a href="mailto:hello@connectvibe.app" style={LINK_STYLE}>
            Questions
          </a>
        </p>

        {/* The phone tab bar, signed in only (every tab is a signed-in
            surface). It is hidden above 899px. */}
        {user ? <MobileTabBar /> : null}
      </div>
    </main>
  );
}
