"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";

import type { PlusPlan } from "@/lib/billing/config";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

/**
 * The only buttons on /plus that touch money, and all they do is hand the
 * student to Stripe: Subscribe opens Stripe's hosted Checkout, Manage
 * subscription opens Stripe's Customer Portal. No card field lives in Vibe.
 *
 * ONE REQUEST AT A TIME, ACROSS ALL THREE BUTTONS. A tap while any request is
 * out is dropped, so a double tap can't open two Checkout sessions and a
 * student can't start monthly and yearly at once. The ref is the guard (state
 * lands a render late, so two quick taps would both read "idle"); the state
 * only greys the buttons.
 *
 * Refusals are `quiet` so this file picks the toast. `already_plus` and
 * `billing_off` mean the page is out of date, so it says so for a moment and
 * reloads into the right state; a "Couldn't start checkout. Try again." there
 * would send the student round the same refusal. Everything else gets
 * describeFailure's line and action, which keeps Sign in on a 401, Review
 * Terms on terms_required, the slow-down line on a 429 and the route's own
 * sentence on a 409.
 *
 * The URL is checked before leaving: only Stripe's own checkout host for
 * Subscribe and billing host for Manage, so a bad answer can't send a student
 * anywhere else.
 */

export type PlanCard = {
  plan: PlusPlan;
  /** "Monthly" */
  name: string;
  /** "$3.99" */
  price: string;
  /** "a month" */
  period: string;
  /** "Works out to about $2.08 a month." */
  note?: string | null;
  /** The auto-renewal line, right under the button that agrees to it. */
  renewal: string;
};

type Target = PlusPlan | "manage";

// Stripe's own hosts. If a custom domain is ever set for Checkout or the
// Portal (Dashboard → Settings → Custom domains), Stripe answers with URLs on
// that domain instead, and every Subscribe and Manage tap here would fail with
// "Try again." Add the domain here in the same change.
const CHECKOUT_PREFIX = "https://checkout.stripe.com/";
const PORTAL_PREFIX = "https://billing.stripe.com/";

/** Shown for a moment before the page reloads into its real state. */
const STALE_COPY = {
  already_plus: "You already have Vibe+. Refreshing…",
  billing_off: "Vibe+ checkout isn't open right now. Refreshing…",
} as const;
const RELOAD_AFTER_MS = 1_500;

/** Only reached when the route's 409 sentence couldn't be shown as it was. */
const ALREADY_SUBSCRIBED =
  "You already have a subscription. Refresh in a moment, or open Manage subscription.";

const SANS = "DM Sans, sans-serif";
const SERIF = "Fraunces, serif";
const CORAL = "#FF5C35";

const GRID: CSSProperties = {
  display: "grid",
  // min() keeps a single card from overflowing a very narrow phone; at 375px
  // the two cards stack, on a laptop they sit side by side.
  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
  gap: 12,
};

const CARD: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  border: "1px solid rgba(28,28,30,0.12)",
  background: "rgba(255,255,255,0.72)",
  borderRadius: 16,
  padding: "16px 18px",
};

const SMALL: CSSProperties = { fontSize: 13, lineHeight: 1.55, color: "#5C5853" };

function buttonStyle(primary: boolean, disabled: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: 44,
    padding: "11px 18px",
    borderRadius: 999,
    border: primary ? `1px solid ${CORAL}` : "1px solid #1C1C1E",
    background: primary ? CORAL : "transparent",
    color: primary ? "#FFFFFF" : "#1C1C1E",
    fontFamily: SANS,
    fontSize: 14.5,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function PlusActions({
  plans = [],
  manage = false,
  manageNote,
  children,
}: {
  plans?: PlanCard[];
  manage?: boolean;
  /** A line above Manage subscription, for when it sits under the plan cards. */
  manageNote?: string | null;
  /** The disclosure, rendered between the plan cards and Manage subscription. */
  children?: ReactNode;
}): JSX.Element | null {
  const inFlight = useRef(false);
  const [pending, setPending] = useState<Target | null>(null);

  // Back from Stripe with the back button, the browser can restore this page
  // from its back/forward cache exactly as it was left: mid-request, every
  // button greyed. Clear that so the buttons work again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      inFlight.current = false;
      setPending(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (plans.length === 0 && !manage) return null;

  const release = () => {
    inFlight.current = false;
    setPending(null);
  };

  const go = async (target: Target) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(target);

    const portal = target === "manage";
    const failure = portal ? "Couldn't open your subscription." : "Couldn't start checkout.";
    const r = await vibeRequest<{ url?: unknown }>(
      portal ? "/api/billing/portal" : "/api/billing/checkout",
      { method: "POST", json: portal ? {} : { plan: target }, quiet: true, failure },
    );

    if (r.ok) {
      const url = typeof r.data.url === "string" ? r.data.url : "";
      if (url.startsWith(portal ? PORTAL_PREFIX : CHECKOUT_PREFIX)) {
        // Leaving for Stripe. The buttons stay greyed until the page goes.
        window.location.assign(url);
        return;
      }
      toast({ message: `${failure} Try again.`, tone: "error" });
      release();
      return;
    }

    if (r.code === "already_plus" || r.code === "billing_off") {
      // The page is stale (Vibe+ already on, or sales switched off since it
      // rendered), and a reload shows the real state. Say why first, so the
      // reload is never a silent one. (A setup fault comes back as 503
      // billing_unavailable instead, and gets a toast, not a reload that
      // would land on the same cards.) Buttons stay greyed.
      toast({ message: STALE_COPY[r.code], tone: "info", durationMs: RELOAD_AFTER_MS });
      window.setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
      return;
    }
    if (r.code === "no_customer") {
      toast({ message: "There's no subscription to manage yet.", tone: "info" });
    } else if (r.code === "already_subscribed" && r.message.startsWith(failure)) {
      // failure-copy fell back to our own "Couldn't start checkout. Try
      // again.", and trying again would only loop into the same 409.
      toast({ message: ALREADY_SUBSCRIBED, tone: "error" });
    } else {
      toast({ message: r.message, tone: "error", action: r.action });
    }
    release();
  };

  const busy = pending !== null;

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: SANS, color: "#2A2620" }}>
      {plans.length > 0 ? (
        <div style={GRID}>
          {plans.map((p) => (
            <div key={p.plan} style={CARD}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#C84A20",
                }}
              >
                {p.name}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.4 }}>
                <strong style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 900, color: "#1C1C1E" }}>
                  {p.price}
                </strong>{" "}
                {p.period}
              </div>
              {p.note ? <div style={SMALL}>{p.note}</div> : null}
              <div style={{ marginTop: "auto", paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => void go(p.plan)}
                  disabled={busy}
                  aria-busy={pending === p.plan}
                  style={buttonStyle(true, busy)}
                >
                  {pending === p.plan ? "Opening checkout…" : `Subscribe ${p.name.toLowerCase()}`}
                </button>
              </div>
              <div style={SMALL}>{p.renewal}</div>
            </div>
          ))}
        </div>
      ) : null}

      {children}

      {manage ? (
        <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
          {manageNote ? <div style={SMALL}>{manageNote}</div> : null}
          <button
            type="button"
            onClick={() => void go("manage")}
            disabled={busy}
            aria-busy={pending === "manage"}
            style={buttonStyle(false, busy)}
          >
            {pending === "manage" ? "Opening…" : "Manage subscription"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
