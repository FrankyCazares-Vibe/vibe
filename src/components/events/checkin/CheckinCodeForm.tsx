"use client";

/**
 * The student's way in at the door (contract 4.1): the QR link's one-tap
 * "I'm here", or the 4-digit code typed from the club's screen. The card's
 * sheet and the QR's landing page both use it.
 *
 * Theme tokens only: it always sits on a cream sheet, dialog or page, so
 * Night mode follows. Refusals are worded by the route's `code`
 * (CHECKIN_ERRORS), never by the server's sentence, and the request is
 * quiet: the line under the field is the answer, not a toast.
 *
 * ONE TAP, NEVER AUTOMATIC (D6): with a token the form shows a button, so a
 * link preview or a forwarded link can't check anyone in by itself. The
 * typed code does send itself at the fourth digit: typing it is the tap.
 */
import { useEffect, useId, useRef, useState } from "react";

import {
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  CHECKIN_STEP_SEC,
  checkInToLine,
  isDoorCode,
  sanitizeDoorCode,
  type CheckinPostBody,
  type CheckinPostResponse,
  type CheckinViewerState,
} from "@/lib/events/event-checkin";
import type { ToastAction } from "@/lib/feedback/failure-copy";
import { vibeRequest } from "@/lib/feedback/request";

import { checkinApiPath, codeFormRefusal, parseViewerState } from "./use-checkin-state";

type Props = {
  eventId: string;
  eventTitle: string;
  /** The QR link's token, when the page was opened from the door's QR. */
  token?: string | null;
  autoFocus?: boolean;
  onCheckedIn: (s: CheckinViewerState, already: boolean) => void;
};

/**
 * "Check-in is busy right now. Try again in a minute." The field comes back
 * after that minute, so the words stay true without a reload. Too many tries
 * stays off: that budget is the day's.
 */
const UNAVAILABLE_RETRY_MS = 60_000;

/**
 * How long the "I'm here" step holds a reload: the longest a QR token can
 * still work after the page opened (its 30 s step and the three before, D4).
 * After that a reload costs nothing, since the token is dead and the code
 * box is where the student would end up anyway.
 */
const TOKEN_HOLD_MS = 4 * CHECKIN_STEP_SEC * 1000;

export function CheckinCodeForm({ eventId, eventTitle, token = null, autoFocus = false, onCheckedIn }: Props) {
  const [mode, setMode] = useState<"token" | "code">(token ? "token" : "code");
  const [tokenHeld, setTokenHeld] = useState(() => !!token);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; action?: ToastAction } | null>(null);
  const [locked, setLocked] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The ref, not the state, guards a second send: two quick changes land
  // before React re-renders with `busy`.
  const busyRef = useRef(false);
  // Set by a handler that wants the cursor back in the field once the
  // field has re-rendered (a wrong code, a switch to the code box).
  const focusNextRef = useRef(false);
  const aliveRef = useRef(true);
  const unlockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (unlockRef.current) clearTimeout(unlockRef.current);
    };
  }, []);

  // The prop never changes for one form, so this runs once. In token mode
  // there is no field yet and nothing takes focus (the button is the tap).
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => setTokenHeld(false), TOKEN_HOLD_MS);
    return () => clearTimeout(t);
  }, [token]);

  useEffect(() => {
    if (!focusNextRef.current) return;
    focusNextRef.current = false;
    inputRef.current?.focus({ preventScroll: true });
  });

  const submit = async (body: CheckinPostBody) => {
    if (busyRef.current || locked) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const r = await vibeRequest<CheckinPostResponse>(checkinApiPath(eventId), {
      method: "POST",
      json: body,
      quiet: true,
      failure: CHECKIN_ERRORS.request_failed,
    });
    busyRef.current = false;
    if (r.ok) {
      // The check-in happened even when the route's follow-up read didn't
      // (contract 3.2): the times are then empty and the slot keeps its own.
      const state = parseViewerState(r.data?.state, eventId) ?? {
        event_id: eventId,
        open: true,
        checked_in: true,
        count: null,
        opens_at: "",
        closes_at: "",
      };
      // Handed up even when this form has gone (the sheet was closed while
      // the answer was out): the server did check them in, and the card
      // that owns the state is still there. Only the form's own state waits
      // for it to be mounted.
      onCheckedIn({ ...state, checked_in: true }, r.data?.already === true);
      if (aliveRef.current) {
        setBusy(false);
        setCode("");
      }
      return;
    }
    // A refusal is the form's own business: nobody is left to show it.
    if (!aliveRef.current) return;
    setBusy(false);
    const refusal = codeFormRefusal(r.code, r.message);
    setError({ message: refusal.message, action: r.action });
    if (refusal.toCode) {
      setMode("code");
      focusNextRef.current = true;
    }
    if (refusal.clear) {
      setCode("");
      focusNextRef.current = true;
    }
    if (refusal.lock) {
      setLocked(true);
      if (r.code === "checkin_unavailable") {
        if (unlockRef.current) clearTimeout(unlockRef.current);
        unlockRef.current = setTimeout(() => {
          unlockRef.current = null;
          setLocked(false);
        }, UNAVAILABLE_RETRY_MS);
      }
    }
  };

  const onCodeChange = (raw: string) => {
    // Digits only, at most 4, so a paste of "12 34" or "12-34" survives.
    const next = sanitizeDoorCode(raw);
    setCode(next);
    if (error && !locked) setError(null);
    if (isDoorCode(next) && !busyRef.current) void submit({ code: next });
  };

  // Held while digits are typed or a request is out, and while the QR's
  // "I'm here" shows: by then the landing has taken the token out of the
  // address bar, so a reload onto a new build would lose it.
  const holds = (mode === "token" && tokenHeld) || code.length > 0 || busy;

  return (
    <div data-holds-reload={holds ? "" : "false"} style={{ width: "100%" }}>
      {mode === "token" ? (
        <TokenStep
          title={eventTitle}
          busy={busy}
          locked={locked}
          onHere={() => {
            if (token) void submit({ token });
          }}
          onTypeCode={() => {
            setMode("code");
            setError(null);
            focusNextRef.current = true;
          }}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isDoorCode(code)) void submit({ code });
          }}
          noValidate
        >
          <label htmlFor={inputId} style={labelStyle}>
            {CHECKIN_COPY.codeLabel}
          </label>
          {/* Not one-time-code: iOS would offer an unrelated SMS code. No
              maxLength: it would cut a paste like "12 34" before the strip. */}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            value={code}
            readOnly={busy}
            disabled={locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => onCodeChange(e.target.value)}
            style={{ ...codeInputStyle, opacity: locked ? 0.55 : 1 }}
          />
          <button
            type="submit"
            className="vibe-press"
            disabled={!isDoorCode(code) || busy || locked}
            style={{ ...primaryButtonStyle, marginTop: 12, opacity: !isDoorCode(code) || locked ? 0.5 : 1 }}
          >
            {busy ? CHECKIN_COPY.checking : CHECKIN_COPY.checkIn}
          </button>
        </form>
      )}
      {error ? (
        <div id={errorId} role="alert" style={errorStyle}>
          {error.message}
          {error.action ? (
            <>
              {" "}
              <a href={error.action.href} style={actionLinkStyle}>
                {error.action.label}
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The QR link's step: one line, "I'm here", and a way to the code box. */
function TokenStep({
  title,
  busy,
  locked,
  onHere,
  onTypeCode,
}: {
  title: string;
  busy: boolean;
  locked: boolean;
  onHere: () => void;
  onTypeCode: () => void;
}) {
  return (
    <div>
      <p style={tokenLineStyle}>{checkInToLine(title)}</p>
      <button
        type="button"
        className="vibe-press"
        onClick={onHere}
        disabled={busy || locked}
        style={{ ...primaryButtonStyle, opacity: locked ? 0.5 : 1 }}
      >
        {busy ? CHECKIN_COPY.checking : CHECKIN_COPY.imHere}
      </button>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <button type="button" className="vibe-press" onClick={onTypeCode} disabled={busy} style={textButtonStyle}>
          {CHECKIN_COPY.typeCodeInstead}
        </button>
      </div>
    </div>
  );
}

// ── Styles (theme tokens only, so Night mode follows) ────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ink-2)",
};

const codeInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  height: 56,
  // The letter spacing trails the last digit too; the same on the left keeps
  // the four digits centred.
  padding: "0 0 0 0.3em",
  borderRadius: 14,
  border: "1px solid rgba(var(--scrim-rgb),0.18)",
  background: "rgba(var(--scrim-rgb),0.03)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 32,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.3em",
  textAlign: "center",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 999,
  border: "none",
  background: "var(--coral)",
  color: "var(--on-coral)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.01em",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const textButtonStyle: React.CSSProperties = {
  minHeight: 32,
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "var(--tag-ink)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const tokenLineStyle: React.CSSProperties = {
  margin: "0 0 14px",
  fontFamily: "Fraunces, serif",
  fontSize: 19,
  fontWeight: 700,
  lineHeight: 1.3,
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  lineHeight: 1.45,
  color: "var(--error-ink)",
};

const actionLinkStyle: React.CSSProperties = {
  color: "var(--tag-ink)",
  fontWeight: 700,
  textDecoration: "underline",
};
