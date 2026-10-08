"use client";

import { useCallback, useEffect, useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * The personal email an account can add after sign-up (school email first,
 * S75; GET / POST / PUT / DELETE /api/me/personal-email). Two homes:
 *
 *   PersonalEmailRow     the "Personal email" row of Settings > Account info.
 *   PersonalEmailPrompt  the one-time card on Campus, for an account that
 *                        signs in with a school email and has no personal one.
 *
 * Both render nothing until the route says the step exists (`available`),
 * so they are safe to ship before the database change is applied.
 *
 * The flow is the same in both: an address, "Send code", the 8-digit code,
 * "Add". Only a proven address is stored. Nothing here changes sign-in.
 */

type State = { available: boolean; personal: string | null; suggested: boolean };
type Loaded = State | null;

const WHY = "Your school closes your school inbox after you graduate. A personal email keeps your account yours.";

function usePersonalEmail(): { state: Loaded; setPersonal: (email: string | null) => void } {
  const [state, setState] = useState<Loaded>(null);
  useEffect(() => {
    let live = true;
    void vibeRequest<{ available?: boolean; personal_email?: string | null; suggested?: boolean }>("/api/me/personal-email", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your personal email.",
    }).then((r) => {
      if (!live || !r.ok) return;
      setState({ available: r.data.available === true, personal: r.data.personal_email ?? null, suggested: r.data.suggested === true });
    });
    return () => {
      live = false;
    };
  }, []);
  const setPersonal = useCallback((email: string | null) => {
    setState((s) => (s ? { ...s, personal: email, suggested: false } : s));
  }, []);
  return { state, setPersonal };
}

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(var(--scrim-rgb),0.16)",
  background: "var(--paper)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  outline: "none",
};
const primary = (busy: boolean): React.CSSProperties => ({
  height: 40,
  padding: "0 16px",
  borderRadius: 10,
  border: "none",
  background: "#FF5C35",
  color: "#140806",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 800,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  whiteSpace: "nowrap",
});
const quiet: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  color: "var(--ink-muted)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
const small: React.CSSProperties = { fontFamily: "DM Sans, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-muted)", margin: 0 };

/** The two steps: the address, then the code. `onAdded` gets the stored address. */
function AddPersonalEmail({ onAdded }: { onAdded: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    const r = await vibeRequest("/api/me/personal-email", { method: "POST", json: { email: address }, quiet: true, failure: "Couldn't send the code." });
    setBusy(false);
    if (r.ok) setSentTo(address);
    else setError(r.message);
  };
  const confirm = async () => {
    if (busy || !sentTo) return;
    setBusy(true);
    setError(null);
    const r = await vibeRequest<{ personal_email?: string }>("/api/me/personal-email", {
      method: "PUT",
      json: { email: sentTo, code },
      quiet: true,
      failure: "Couldn't add that email.",
    });
    setBusy(false);
    if (r.ok && typeof r.data.personal_email === "string") onAdded(r.data.personal_email);
    else if (!r.ok) setError(r.message);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void (sentTo ? confirm() : send());
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {sentTo ? (
        <>
          <p style={{ ...small, overflowWrap: "anywhere" }}>
            If <strong style={{ color: "var(--charcoal)" }}>{sentTo}</strong> can be added, an 8-digit code is on its way to it. Type it here.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="8-digit code"
              aria-label="8-digit code"
              style={{ ...input, letterSpacing: "2px" }}
            />
            <button type="submit" disabled={busy} style={primary(busy)}>
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          <div>
            <button
              type="button"
              style={quiet}
              onClick={() => {
                setSentTo(null);
                setCode("");
                setError(null);
              }}
            >
              Use a different address
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@gmail.com"
            aria-label="Personal email"
            style={input}
          />
          <button type="submit" disabled={busy} style={primary(busy)}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" style={{ ...small, color: "#C0392B" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** The two grid cells of Settings > Account info (label, value). Nothing until the step exists. */
export function PersonalEmailRow({ labelStyle }: { labelStyle: React.CSSProperties }) {
  const { state, setPersonal } = usePersonalEmail();
  const [busy, setBusy] = useState(false);
  if (!state || !state.available) return null;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const r = await vibeRequest("/api/me/personal-email", { method: "DELETE", failure: "Couldn't remove that email." });
    setBusy(false);
    if (r.ok) setPersonal(null);
  };

  return (
    <>
      <div style={labelStyle}>Personal email</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {state.personal ? (
          <>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 14, color: "var(--charcoal)", wordBreak: "break-word" }}>{state.personal}</div>
            <p style={small}>
              Confirmed. It keeps your account yours after your school inbox closes. Only you can see it.{" "}
              <button type="button" style={quiet} onClick={() => void remove()} disabled={busy}>
                {busy ? "Removing…" : "Remove"}
              </button>
            </p>
          </>
        ) : (
          <>
            <p style={small}>{WHY} Only you can see it.</p>
            <AddPersonalEmail onAdded={setPersonal} />
          </>
        )}
      </div>
    </>
  );
}

const DISMISS_KEY = "vibe.personalEmailPrompt.v1";
const ASK_AGAIN_MS = 60 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

/**
 * The card on Campus: asked once, and again 60 days after "Not now" (it is
 * always in Settings). Only for an account that signs in with a school
 * email and has no personal one (`suggested`).
 */
export function PersonalEmailPrompt() {
  const { state, setPersonal } = usePersonalEmail();
  const isMobile = useIsMobile();
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [skip] = useState(() => (typeof window === "undefined" ? true : dismissedRecently()));

  if (!state || !state.available || closed || skip) return null;
  if (!state.suggested && !done) return null;

  const notNow = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // It asks again next visit: nothing is lost.
    }
    setClosed(true);
  };

  return (
    <section
      aria-label="Add a personal email"
      // Unsaved typing here is typed text; the marker covers the code step too.
      data-holds-reload=""
      style={{
        position: "fixed",
        zIndex: 9980,
        left: isMobile ? 12 : "auto",
        right: isMobile ? 12 : 96,
        bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom, 0px))" : 24,
        width: isMobile ? "auto" : 380,
        boxSizing: "border-box",
        padding: 18,
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--paper)",
        boxShadow: "0 18px 48px rgba(0,0,0,.2), 0 2px 10px rgba(0,0,0,.08)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px", color: "var(--charcoal)" }}>
        {done ? "You're set." : "Keep your account after graduation"}
      </h2>
      {done ? (
        <>
          <p style={{ ...small, overflowWrap: "anywhere" }}>
            <strong style={{ color: "var(--charcoal)" }}>{done}</strong> is on your account. You can change it in Settings.
          </p>
          <div>
            <button type="button" style={quiet} onClick={() => setClosed(true)}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={small}>{WHY} It&apos;s optional, and only you can see it.</p>
          <AddPersonalEmail
            onAdded={(email) => {
              setPersonal(email);
              setDone(email);
            }}
          />
          <div>
            <button type="button" style={quiet} onClick={notNow}>
              Not now
            </button>
          </div>
        </>
      )}
    </section>
  );
}
