"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { pushLogoutBody } from "@/lib/pwa/device-push";

/**
 * Settings → "Where you're signed in" (handoffs/2026-10-11-browser-rule-plan.md;
 * GET / DELETE /api/me/sessions). Franky, Oct 11: no Supabase Pro, so a
 * sign-in never times out on its own; this card is how a student sees how
 * many are open and ends the ones they forgot, keeping this one.
 *
 * The number is sign-ins, not devices (skeptic amendment 3): every sign-in
 * on the same phone adds one until a sign-out there, so "N devices" would be
 * wrong for nearly everyone. The button still ends them all, stale ones too.
 *
 * Mounted directly above SignOutCard. Its glass and title copy SettingsClient's
 * CARD_GLASS and SectionTitle, so it reads as one of that page's cards.
 */

type Count = number | null | "loading";

// SettingsClient's CARD_GLASS: the C0 tokens, so it flips with data-theme.
const CARD_GLASS: React.CSSProperties = {
  background: "var(--glass)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: "1px solid var(--glass-border)",
  borderRadius: 18,
  boxShadow: "var(--card-shadow)",
};
const TITLE: React.CSSProperties = {
  fontFamily: "Fraunces, serif",
  fontSize: 22,
  fontWeight: 800,
  color: "var(--charcoal)",
  letterSpacing: "-0.01em",
  margin: "0 0 14px",
};
const BODY: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  color: "var(--ink-2)",
  margin: "0 0 6px",
  maxWidth: 440,
  lineHeight: 1.5,
};
const HINT: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  color: "var(--ink-muted)",
  margin: "0 0 14px",
  maxWidth: 440,
  lineHeight: 1.5,
};

function countLine(count: Count): string {
  if (count === "loading") return "…";
  if (count === null) return "We couldn't count your sign-ins right now.";
  if (count === 1) return "This is your only active sign-in.";
  return `You have ${count} active sign-ins.`;
}

export function SessionsCard() {
  const [count, setCount] = useState<Count>("loading");
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  // Quiet: a failed read is the "couldn't count" line, not a toast on open.
  const load = useCallback(async () => {
    const r = await vibeRequest<{ count?: number | null }>("/api/me/sessions", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't count your sign-ins.",
    });
    if (!live.current) return;
    setCount(r.ok && typeof r.data.count === "number" ? r.data.count : null);
  }, []);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const onSignOutOthers = async () => {
    if (busy) return;
    setBusy(true);
    // `push_address` keeps this device's notifications; the route drops the
    // rest of this student's devices (the ones being signed out).
    const r = await vibeRequest("/api/me/sessions", {
      method: "DELETE",
      json: pushLogoutBody(),
      failure: "Couldn't sign out your other devices.",
    });
    if (!live.current) return;
    setBusy(false);
    if (!r.ok) return; // vibeRequest already toasted the reason
    toast("Signed out everywhere else.");
    setCount("loading");
    void load();
  };

  const only = count === 1;
  return (
    <section style={{ ...CARD_GLASS, padding: 22, marginBottom: 16 }}>
      <h2 style={TITLE}>Where you&apos;re signed in</h2>
      <p style={BODY} aria-live="polite">
        {countLine(count)}
      </p>
      <p style={HINT}>
        Every time you sign in on a device or browser counts once until you sign out there. This button keeps
        this one and ends the rest.
      </p>
      <button
        type="button"
        onClick={() => void onSignOutOthers()}
        disabled={busy || only}
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: "1px solid rgba(var(--scrim-rgb),0.14)",
          background: "rgba(var(--scrim-rgb),0.04)",
          color: "var(--charcoal)",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          cursor: busy ? "wait" : only ? "default" : "pointer",
          opacity: busy || only ? 0.55 : 1,
        }}
      >
        {busy ? "Signing out…" : "Sign out of other devices"}
      </button>
    </section>
  );
}
