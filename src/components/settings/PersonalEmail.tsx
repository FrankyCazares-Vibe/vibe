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

/**
 * The line for a failed send or check. A 429 from these routes says which
 * limit it was and how long is left, or that the code couldn't be sent or
 * checked right now (src/app/api/me/personal-email/route.ts, school-checkin),
 * and the shared copy would turn every one into "You're going a little fast",
 * so the route's own sentence is shown, as StepCampus does.
 */
function limitLine(r: { status: number; error: string | null; message: string }): string {
  return r.status === 429 && r.error ? r.error : r.message;
}

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
    else setError(limitLine(r));
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
    else if (!r.ok) setError(limitLine(r));
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

type Checkin = { open: boolean; stage: string; deadline: string | null };

const dateInWords = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/**
 * The yearly school check-in, on Campus (src/lib/auth/school-checkin.ts;
 * /api/me/school-checkin). Shown while a check-in is waiting for its code:
 * before the countdown it can be put off for the visit; once the countdown
 * runs it stays, with the date the account would be deleted. Two ways out,
 * both here: type the code from the school inbox, or add a personal email.
 */
function SchoolCheckinCard({ checkin, onDone }: { checkin: Checkin; onDone: () => void }) {
  const isMobile = useIsMobile();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const counting = !!checkin.deadline;
  if (later && !counting) return null;

  const answer = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await vibeRequest("/api/me/school-checkin", { method: "POST", json: { code }, quiet: true, failure: "Couldn't check that code." });
    setBusy(false);
    if (r.ok) onDone();
    else setError(limitLine(r));
  };
  const again = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await vibeRequest("/api/me/school-checkin", { method: "PUT", quiet: true, failure: "Couldn't send the code." });
    setBusy(false);
    if (r.ok) setNote("Sent again to your school email.");
    else setError(limitLine(r));
  };

  return (
    <section
      aria-label="School email check-in"
      data-holds-reload=""
      style={{
        position: "fixed",
        zIndex: 9980,
        left: isMobile ? 12 : "auto",
        right: isMobile ? 12 : 96,
        bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom, 0px))" : 24,
        width: isMobile ? "auto" : 380,
        maxHeight: "calc(100dvh - 120px)",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: 18,
        borderRadius: 16,
        border: counting ? "1px solid rgba(255,92,53,0.55)" : "1px solid var(--hairline)",
        background: "var(--paper)",
        boxShadow: "0 18px 48px rgba(0,0,0,.2), 0 2px 10px rgba(0,0,0,.08)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: "Fraunces, serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px", color: "var(--charcoal)" }}>
        {counting ? "Keep your account" : "Still have your school email?"}
      </h2>
      <p style={small}>
        {counting ? (
          <>
            We emailed a code to your school email and didn&apos;t hear back. Type it here or add a personal email by{" "}
            <strong style={{ color: "var(--charcoal)" }}>{dateInWords(checkin.deadline as string)}</strong>. If you do neither, your account and
            everything in it is deleted then.
          </>
        ) : (
          <>Once a year we check. We emailed a code to your school email: type it here. Or add a personal email below and we won&apos;t ask again.</>
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void answer();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="8-digit code"
          aria-label="8-digit code from your school email"
          style={{ ...input, letterSpacing: "2px" }}
        />
        <button type="submit" disabled={busy} style={primary(busy)}>
          {busy ? "Checking…" : "Confirm"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <button type="button" style={quiet} onClick={() => void again()} disabled={busy}>
          Send the code again
        </button>
        {counting ? null : (
          <button type="button" style={quiet} onClick={() => setLater(true)}>
            Later
          </button>
        )}
      </div>
      {note ? <p style={small}>{note}</p> : null}
      {error ? (
        <p role="alert" style={{ ...small, color: "#C0392B" }}>
          {error}
        </p>
      ) : null}
      <p style={{ ...small, marginTop: 4 }}>
        <strong style={{ color: "var(--charcoal)" }}>Can&apos;t open that inbox any more?</strong> Add a personal email instead:
      </p>
      <AddPersonalEmail onAdded={onDone} />
    </section>
  );
}

/**
 * This visit is the one onboarding hands over to (`?welcome=1`, or the
 * campus tour's pending flag, which a club-link guest carries to their first
 * Campus visit): the tour runs, or is about to.
 */
function readWelcomeVisit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("welcome") === "1") return true;
  } catch {
    // Fall through to the flag.
  }
  try {
    return localStorage.getItem("vibe_tour_pending") === "campus";
  } catch {
    return false;
  }
}

/**
 * The one card Campus shows about the account's emails: the school check-in
 * while one is open, otherwise the one-time "add a personal email" offer.
 * Never both.
 *
 * The offer waits out the welcome visit on both devices (first run, Oct 24
 * 2026): it sits by the Otto orb, where the tour's first bubble opens, and
 * nothing should ask before Vibe has shown anything. Read once, at mount, as
 * CampusMobile reads `?welcome=1` for its push ask: the tour drops both the
 * param and the flag. It asks on the next visit instead; nothing is stored.
 */
export function CampusAccountCard() {
  const [welcomeVisit] = useState(readWelcomeVisit);
  const [checkin, setCheckin] = useState<Checkin | null | "none">(null);
  useEffect(() => {
    let live = true;
    void vibeRequest<{ open?: boolean; stage?: string; deadline?: string | null }>("/api/me/school-checkin", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your account.",
    }).then((r) => {
      if (!live) return;
      setCheckin(r.ok && r.data.open === true ? { open: true, stage: String(r.data.stage ?? ""), deadline: r.data.deadline ?? null } : "none");
    });
    return () => {
      live = false;
    };
  }, []);
  if (checkin === null) return null;
  if (checkin === "none") return welcomeVisit ? null : <PersonalEmailPrompt />;
  return <SchoolCheckinCard checkin={checkin} onDone={() => setCheckin("none")} />;
}
