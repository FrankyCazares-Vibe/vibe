"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { WAITLIST_RETENTION_DAYS, type WaitlistPublicState } from "@/lib/waitlist/types";

/** What the page can be showing: a list state, or one of its own. */
type View = WaitlistPublicState | "loading" | "no_token" | "error" | "left";
type Copy = {
  title: string;
  body: string;
  link?: { href: string; label: string };
  /** A quiet second way on, under the buttons. */
  also?: { lead: string; href: string; label: string };
};

const JOIN = { href: "/waitlist", label: "Join the waitlist" };
const HAVE_CODE = { lead: "Got an access code?", href: "/auth/signup", label: "Create your account" };
const CLUB_HREF = "mailto:help@connectvibe.app?subject=Bring%20my%20club%20to%20Vibe";
const LOST_CODE_HREF = "mailto:help@connectvibe.app?subject=My%20Vibe%20access%20code";
const DAYS = WAITLIST_RETENTION_DAYS;

// Draft words for Franky. Only the state: never a name or an address.
const COPY: Record<Exclude<View, "loading">, Copy> = {
  no_token: { title: "Open the link from your email.", body: "This page needs the button in the email we sent you.", link: JOIN },
  error: { title: "We couldn’t check your link.", body: "Something went wrong on our side, or the connection dropped. Try again in a minute." },
  // No entry has this token: the spot ran its 40 days and was deleted, the
  // person left, or a newer email from Vibe replaced the link (and the
  // person may well be invited by now). The page can't tell which, so the
  // words cover all of them.
  unknown: {
    title: "This link no longer works.",
    body: `Your spot may have expired after ${DAYS} days, or a newer email from Vibe replaced this link. Join the waitlist again, or use the link in your latest email from us.`,
    link: JOIN,
    also: HAVE_CODE,
  },
  unconfirmed: { title: "Confirm your spot.", body: "Tap the button to confirm this school email and hold your place on the waitlist." },
  confirm_expired: {
    title: "This link has expired.",
    body: "Confirm links last 7 days. Fill in the form again with the same school email and we’ll send a fresh one.",
    link: JOIN,
  },
  waiting: {
    title: "You’re on the list.",
    body: `Your spot is confirmed. We’ll email you an access code when it’s your turn. A spot lasts up to ${DAYS} days; if we haven’t sent your code by then, you can join again.`,
    link: { href: "/", label: "Back to Vibe" },
    also: { lead: "Run a club?", href: CLUB_HREF, label: "Bring your club" },
  },
  invited: {
    title: "Your access code is waiting.",
    body: "We emailed you an access code. Use it to create your account; the button in that email fills it in for you.",
    link: { href: "/auth/signup", label: "Create your account" },
    also: { lead: "Can’t find it? Search your email for “Your Vibe access code”, or", href: LOST_CODE_HREF, label: "ask us for a new one" },
  },
  invite_expired: { title: "Your access code has expired.", body: "Reply to your invite email and we’ll send you a new one." },
  joined: { title: "You’re in.", body: "You already made your Vibe account.", link: { href: "/auth/login", label: "Log in" } },
  left: { title: "You’re off the list.", body: "We deleted your answers. Changed your mind? You can join again any time.", link: JOIN },
};

/** Where the page's link is the quiet way on, not the next step. */
const GHOST = new Set<View>(["left", "confirm_expired", "no_token", "waiting"]);

/** States where "Take me off the list" makes sense. */
const CAN_LEAVE = new Set<View>(["unconfirmed", "confirm_expired", "waiting", "invited", "invite_expired"]);

/**
 * POSTs `{token}`: the state the route names, "ok" for a success that names
 * none (leaving answers a plain `{ok:true}`), or "error". Never throws.
 */
async function ask(path: string, token: string): Promise<View | "ok"> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (res.status >= 500 || res.status === 429) return "error";
    const body: unknown = await res.json().catch(() => null);
    const state = (body as { state?: unknown } | null)?.state;
    if (typeof state === "string" && state in COPY) return state as View;
    return res.ok && (body as { ok?: unknown } | null)?.ok === true ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** The token is read from the address after load, never rendered on the server. */
function readToken(): string | null {
  const t = new URLSearchParams(window.location.search).get("token")?.trim();
  return t ? t.slice(0, 200) : null;
}

export function ConfirmClient() {
  const [view, setView] = useState<View>("loading");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [round, setRound] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // Looking changes nothing: a status read on load (and on "Try again").
  // The emails' "Take me off the list" link adds `leave=1`: the page then
  // opens on the question, and leaving still takes a tap.
  useEffect(() => {
    let cancelled = false;
    const token = readToken();
    const leaveAsked = new URLSearchParams(window.location.search).get("leave") === "1";
    const next: Promise<View | "ok"> = token ? ask("/api/waitlist/status", token) : Promise.resolve("no_token");
    void next.then((v) => {
      if (cancelled) return;
      const shown = v === "ok" ? "error" : v;
      setView(shown);
      if (leaveAsked && CAN_LEAVE.has(shown)) setLeaving(true);
    });
    return () => {
      cancelled = true;
    };
  }, [round]);

  // After a tap, the new heading takes focus so the change is announced.
  useEffect(() => {
    if (moved.current && view !== "loading") title.current?.focus();
  }, [view]);

  async function act(path: string, after?: View) {
    const token = readToken();
    if (!token || busy) return;
    setBusy(true);
    const result = await ask(path, token);
    moved.current = true;
    setBusy(false);
    setLeaving(false);
    if (after) setView(result === "error" ? "error" : after);
    else setView(result === "ok" ? "error" : result);
  }

  if (view === "loading") {
    return (
      <section className="vln-panel" aria-busy="true">
        <header className="vln-panel-head"><b>02</b><span>Your spot</span></header>
        <p role="status">Checking your link…</p>
      </section>
    );
  }

  const copy = COPY[view];
  return (
    <section className="vln-panel" aria-labelledby="vwl-confirm-title">
      <header className="vln-panel-head"><b>02</b><span>Your spot</span></header>
      <h1 id="vwl-confirm-title" ref={title} tabIndex={-1} style={{ outline: "none" }}>{copy.title}</h1>
      <p role="status">{copy.body}</p>

      {view === "unconfirmed" || view === "error" || copy.link ? (
        <div className="vwl-actions">
          {view === "unconfirmed" ? (
            <button type="button" className="vln-btn" disabled={busy} onClick={() => void act("/api/waitlist/confirm")}>
              {busy ? "Confirming…" : "Confirm my spot"}
            </button>
          ) : null}
          {view === "error" ? (
            <button type="button" className="vln-btn" onClick={() => { setView("loading"); setRound((n) => n + 1); }}>
              Try again
            </button>
          ) : null}
          {copy.link ? (
            <Link href={copy.link.href} className={GHOST.has(view) ? "vln-btn vln-btn-ghost" : "vln-btn"}>
              {copy.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}
      {copy.also ? (
        <p>
          {copy.also.lead}{" "}
          {copy.also.href.startsWith("/") ? (
            <Link href={copy.also.href} className="vwl-quiet">{copy.also.label}</Link>
          ) : (
            <a href={copy.also.href} className="vwl-quiet">{copy.also.label}</a>
          )}
        </p>
      ) : null}

      {CAN_LEAVE.has(view) ? (
        <div className="vwl-more">
          {leaving ? (
            <>
              <p>This takes you off the list and deletes your answers.</p>
              <div className="vwl-actions" style={{ marginTop: 6 }}>
                <button type="button" className="vln-btn vln-btn-ghost" disabled={busy} onClick={() => void act("/api/waitlist/leave", "left")}>
                  {busy ? "Taking you off…" : "Yes, take me off"}
                </button>
                <button type="button" className="vwl-quiet" disabled={busy} onClick={() => setLeaving(false)}>
                  Keep my spot
                </button>
              </div>
            </>
          ) : (
            <p>
              <button type="button" className="vwl-quiet" onClick={() => setLeaving(true)}>Take me off the list</button>
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
