"use client";

import { useEffect, useRef, type CSSProperties, type JSX } from "react";

import { ONB_COPY } from "./onb-copy";
import {
  COLORS,
  fieldErrorStyle,
  inputStyle,
  labelStyle,
  primaryCtaStyle,
  secondaryLinkStyle,
} from "./onb-theme";
import { handleStatusColor, type HandleStatus } from "./StepProfile";

/**
 * "Skip the rest?" (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 13).
 *
 * Two variants, picked by the parent (`OnboardingMobile`):
 *   - `saved`: a name and handle are already saved, so skipping keeps
 *     everything. Keep going / Skip anyway.
 *   - `identity`: nobody can find a student without a name and handle, so the
 *     sheet asks for both first. Its inputs are bound to the SAME state as the
 *     profile step, and Save & skip saves them before finishing.
 *
 * On open, focus goes to the primary button, never an input, so the keyboard
 * doesn't pop over the sheet. A backdrop tap or Escape means Keep going, but
 * only while nothing is saving: the sheet can't close mid-save.
 */
export function SkipSheet(p: {
  open: boolean;
  variant: "saved" | "identity";
  busy: boolean;
  name: string;
  handle: string;
  handleStatus: HandleStatus;
  nameError: string | null;
  handleError: string | null;
  onName: (v: string) => void;
  onHandleInput: (raw: string) => void;
  onKeepGoing: () => void;
  onSkipAnyway: () => void;
  onSaveAndSkip: () => void;
}): JSX.Element | null {
  const { open, variant, busy, onKeepGoing } = p;
  const copy = ONB_COPY.skip;
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onKeepGoing();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onKeepGoing]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onKeepGoing();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="onbSkipTitle" style={cardStyle}>
        <h2 id="onbSkipTitle" style={titleStyle}>
          {copy.title}
        </h2>

        {variant === "saved" ? (
          <>
            <p style={bodyStyle}>{copy.bodySaved}</p>
            <div style={rowStyle}>
              <button ref={primaryRef} type="button" style={primaryCtaStyle} disabled={busy} onClick={onKeepGoing}>
                {copy.keepGoing}
              </button>
              <button type="button" style={secondaryTapStyle} disabled={busy} onClick={p.onSkipAnyway}>
                {busy ? copy.skipping : copy.skipAnyway}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={bodyStyle}>{copy.bodyIdentity}</p>
            <div style={fieldsStyle}>
              <div>
                <label htmlFor="onbSkipName" style={labelStyle}>
                  {ONB_COPY.profile.labels.name}
                </label>
                <input
                  id="onbSkipName"
                  type="text"
                  value={p.name}
                  onChange={(e) => p.onName(e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  aria-invalid={p.nameError ? true : undefined}
                  aria-describedby={p.nameError ? "onbSkipNameError" : undefined}
                  style={inputStyle}
                />
                {p.nameError && (
                  <p id="onbSkipNameError" role="alert" style={fieldErrorStyle}>
                    {p.nameError}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="onbSkipHandle" style={labelStyle}>
                  {ONB_COPY.profile.labels.handle}
                </label>
                <div style={handleWrapStyle}>
                  <span style={handleAtStyle}>@</span>
                  <input
                    id="onbSkipHandle"
                    type="text"
                    value={p.handle}
                    onChange={(e) => p.onHandleInput(e.target.value)}
                    maxLength={20}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    aria-invalid={p.handleError ? true : undefined}
                    aria-describedby={p.handleError ? "onbSkipHandleError" : undefined}
                    style={handleInputStyle}
                  />
                  {p.handleStatus && (
                    <span
                      aria-live="polite"
                      style={{ ...handleStatusStyle, color: handleStatusColor(p.handleStatus) }}
                    >
                      {p.handleStatus.text}
                    </span>
                  )}
                </div>
                {p.handleError && (
                  <p id="onbSkipHandleError" role="alert" style={fieldErrorStyle}>
                    {p.handleError}
                  </p>
                )}
              </div>
            </div>
            <div style={rowStyle}>
              <button ref={primaryRef} type="button" style={primaryCtaStyle} disabled={busy} onClick={p.onSaveAndSkip}>
                {busy ? copy.saving : copy.saveAndSkip}
              </button>
              <button type="button" style={secondaryTapStyle} disabled={busy} onClick={onKeepGoing}>
                {copy.keepGoing}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(10,10,12,.78)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};
const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 360,
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  background: COLORS.charcoalSoft,
  border: `1px solid ${COLORS.faintBorder}`,
  borderRadius: 20,
  padding: 22,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const titleStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 20,
  fontWeight: 900,
  color: "white",
  margin: 0,
};
const bodyStyle: CSSProperties = {
  fontSize: 14,
  color: "rgba(255,255,255,.7)",
  lineHeight: 1.5,
  margin: 0,
};
/** The theme's text button, at least 44px tall to tap. */
const secondaryTapStyle: CSSProperties = { ...secondaryLinkStyle, minHeight: 44 };
const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 4,
};
const fieldsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  textAlign: "left",
};
const handleWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: COLORS.fieldBg,
  border: `1px solid ${COLORS.fieldBorder}`,
  borderRadius: 12,
  padding: "10px 12px",
};
const handleAtStyle: CSSProperties = {
  color: "rgba(255,255,255,.55)",
  fontWeight: 600,
  fontSize: 16,
};
const handleInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  background: "none",
  color: "white",
  fontSize: 16,
  outline: "none",
  fontFamily: "inherit",
};
const handleStatusStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
};
