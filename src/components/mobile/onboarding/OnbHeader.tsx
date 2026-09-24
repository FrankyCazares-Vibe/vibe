"use client";

import { useState, type CSSProperties, type JSX } from "react";
import { Drawer } from "vaul";

import {
  SUPPORT_EMAIL,
  useLeaveAccount,
  useOwnHandle,
} from "@/app/account/suspended/suspended-actions";

import { ONB_COPY } from "./onb-copy";
import { COLORS, fieldErrorStyle, inputStyle, secondaryLinkStyle } from "./onb-theme";

/**
 * The phone onboarding's pinned header (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 6):
 * Back, the logo, "{n} of 6", and Skip, on every step.
 *
 * Sticky at the top of the page. That only holds because the shell
 * (`OnboardingMobile`) is not a scroll container: its old `overflow: hidden`
 * made the header scroll away with the step.
 *
 * Back is hidden (but keeps its column) on step 1 and calls `onBack`, which
 * the parent wires to `history.back()` so the header, the browser and the iOS
 * swipe all go back the same way. Skip shows on all six steps, step 1
 * included. Both are disabled while the parent is saving.
 *
 * The "⋯" at the end opens the account sheet (Sign out, Delete account), so
 * nobody has to finish onboarding to leave, or to take their account off
 * Vibe (App Review checks both). It is never disabled: leaving must not wait
 * on a save.
 */
export function OnbHeader(p: {
  step: number;
  total: number;
  backDisabled: boolean;
  skipDisabled: boolean;
  onBack: () => void;
  onSkip: () => void;
}): JSX.Element {
  // `total` is part of the contract; the copy ("{n} of 6") already carries it.
  const { step, backDisabled, skipDisabled, onBack, onSkip } = p;
  const copy = ONB_COPY.header;
  const progress = copy.progress.replace("{n}", String(step));
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header style={topBarStyle}>
      <button
        type="button"
        aria-label={copy.back}
        disabled={backDisabled}
        onClick={onBack}
        style={{
          ...backBtnStyle,
          visibility: step <= 1 ? "hidden" : "visible",
          opacity: backDisabled ? 0.4 : 1,
        }}
      >
        <span aria-hidden="true">←</span>
      </button>
      <div style={logoStyle}>
        vibe<span style={{ color: COLORS.accent }}>.</span>
      </div>
      <span style={progressTextStyle}>{progress}</span>
      <button
        type="button"
        disabled={skipDisabled}
        onClick={onSkip}
        style={{ ...skipBtnStyle, opacity: skipDisabled ? 0.4 : 1 }}
      >
        {copy.skip}
      </button>
      {/* Label inline: onb-copy.ts belongs to another batch this wave. */}
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        aria-expanded={accountOpen}
        onClick={() => setAccountOpen(true)}
        style={moreBtnStyle}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {/* Portaled to <body> by vaul, so it adds no cell to the grid. */}
      {accountOpen ? <AccountSheet onClose={() => setAccountOpen(false)} /> : null}
    </header>
  );
}

/**
 * The account sheet: Sign out and Delete account, the same requests and the
 * same confirmation as /account/suspended and /auth/school-email
 * (`useLeaveAccount`). It reads the handle itself each time it opens, since
 * the profile step may have just claimed one; until then the handle is the
 * placeholder and the box asks for the word "delete". Mounted only while
 * open, like the other phone sheets, and it can't be dismissed mid-delete or
 * mid-sign-out: a failed request needs the sheet still there to say so.
 * Strings are inline for the same reason as the "⋯" label.
 */
function AccountSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const handle = useOwnHandle(true);
  const leave = useLeaveAccount(handle);
  const [confirming, setConfirming] = useState(false);
  const { expected, matches, deleting } = leave;
  const lit = matches && !deleting;

  return (
    <Drawer.Root
      open
      dismissible={!deleting && !leave.signingOut}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content aria-describedby={undefined} style={sheetStyle}>
          <Drawer.Handle style={sheetHandleStyle} />
          <Drawer.Title style={sheetTitleStyle}>Your account</Drawer.Title>
          {!confirming ? (
            <div style={sheetColumnStyle}>
              <button
                type="button"
                onClick={() => void leave.signOut()}
                disabled={leave.signingOut}
                style={sheetRowStyle}
              >
                {leave.signingOut ? "Signing out…" : "Sign out"}
              </button>
              {leave.signOutError ? (
                <p role="alert" style={{ ...fieldErrorStyle, marginTop: 0 }}>
                  {leave.signOutError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={leave.signingOut}
                style={{ ...sheetRowStyle, color: "#FF6B6B" }}
              >
                Delete account
              </button>
              {/* A visible way out, like the Cancel row that ends the feed's
                  post actions sheet: with VoiceOver on, dragging the sheet down
                  or finding the overlay isn't something to count on. Held
                  while signing out so a failure has a sheet to say so in. */}
              <button
                type="button"
                onClick={onClose}
                disabled={leave.signingOut}
                style={keepBtnStyle}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={sheetColumnStyle}>
              {/* Vibe+ is said here, next to the button that cancels it, not
                  on the row that only opens this box. */}
              {leave.loading ? (
                <p style={sheetBodyStyle}>Loading…</p>
              ) : leave.canConfirm ? (
                <>
                  <p style={sheetBodyStyle}>
                    This can&apos;t be undone. Your profile, posts, comments and
                    messages are removed for good, and if you have Vibe+ it&apos;s
                    canceled right away — no refund.{" "}
                    {leave.byWord ? (
                      <>
                        Type <strong style={{ color: "white" }}>{expected}</strong> to
                        confirm.
                      </>
                    ) : (
                      <>
                        Type your handle{" "}
                        <strong style={{ color: "white" }}>@{expected}</strong> to confirm.
                      </>
                    )}
                  </p>
                  <input
                    value={leave.confirm}
                    onChange={(e) => leave.setConfirm(e.target.value)}
                    placeholder={leave.byWord ? expected : `@${expected}`}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-label={
                      leave.byWord
                        ? `Type ${expected} to confirm`
                        : "Type your handle to confirm"
                    }
                    style={inputStyle}
                  />
                </>
              ) : (
                <p style={sheetBodyStyle}>
                  We couldn&apos;t load your handle, so we can&apos;t take the
                  confirmation here. Email{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: COLORS.accent }}>
                    {SUPPORT_EMAIL}
                  </a>{" "}
                  from the address you sign in with and we&apos;ll delete the account
                  and everything in it for you.
                </p>
              )}
              {leave.error ? (
                <p role="alert" style={{ ...fieldErrorStyle, marginTop: 0 }}>
                  {leave.error}
                </p>
              ) : null}
              {leave.canConfirm && !leave.loading ? (
                <button
                  type="button"
                  onClick={() => void leave.deleteAccount()}
                  disabled={!lit}
                  style={{
                    ...deleteBtnStyle,
                    background: lit
                      ? "linear-gradient(180deg, #E04848 0%, #B83030 100%)"
                      : "rgba(220,60,60,0.18)",
                    color: lit ? "#fff" : "#FF8A8A",
                    cursor: lit ? "pointer" : "not-allowed",
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? "Deleting…" : "Permanently delete"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  leave.reset();
                }}
                disabled={deleting}
                style={keepBtnStyle}
              >
                Keep my account
              </button>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const topBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "grid",
  // Back, logo, "{n} of 6", Skip, and the 44 px "⋯".
  gridTemplateColumns: "44px 1fr auto auto 44px",
  alignItems: "center",
  gap: 8,
  padding:
    "calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px",
  background:
    "linear-gradient(to bottom, rgba(28,28,30,.95) 60%, rgba(28,28,30,.0))",
  backdropFilter: "blur(8px)",
};

const logoStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: "-0.5px",
  color: "white",
};

const progressTextStyle: CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,.55)",
  marginLeft: 6,
  fontWeight: 500,
  letterSpacing: "0.3px",
};

const backBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginLeft: -10,
  padding: 0,
  background: "none",
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 22,
  lineHeight: 1,
  fontFamily: "inherit",
};

const skipBtnStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: "8px 4px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,.5)",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  textAlign: "right",
};

/**
 * Back's twin on the right: 44 px, pulled into the gutter the same 10 px.
 * `justifySelf: "end"` is what makes the negative margin move it. A fixed-width
 * grid item sits at the start of its column, so on its own a -10 px right
 * margin only shrinks the margin box and the button stays put; aligned to the
 * end, the margin box's edge meets the column's and the button pokes 10 px
 * past it, the mirror of Back's -10 px left margin.
 */
const moreBtnStyle: CSSProperties = {
  justifySelf: "end",
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginRight: -10,
  padding: 0,
  background: "none",
  border: "none",
  borderRadius: 12,
  color: "rgba(255,255,255,.7)",
  fontSize: 22,
  lineHeight: 1,
  fontFamily: "inherit",
};

// The account sheet. 10400/10401 is the tier every phone vaul sheet uses
// (ReportSheet, SharePostSheet, EditPostSheet): above the header and the
// sticky footer, below ToastHost (12000). It is portaled to <body>, outside
// the shell, so it names the shell's font itself; the colours are SkipSheet's,
// so both onboarding sheets read as one.
const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,10,12,.6)",
  zIndex: 10400,
};

const sheetStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: "85dvh",
  overflowY: "auto",
  background: COLORS.charcoalSoft,
  borderTop: `1px solid ${COLORS.faintBorder}`,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
  zIndex: 10401,
  outline: "none",
  color: "white",
  fontFamily:
    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
};

const sheetHandleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(255,255,255,.18)",
};

const sheetTitleStyle: CSSProperties = {
  margin: 0,
  padding: "10px 20px 6px",
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 18,
  fontWeight: 900,
  color: "white",
};

const sheetColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "8px 20px 4px",
};

/** One full-width 48 px row per action, like a phone action sheet. */
const sheetRowStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 16px",
  borderRadius: 14,
  border: `1px solid ${COLORS.faintBorder}`,
  background: COLORS.fieldBg,
  color: "white",
  fontFamily: "inherit",
  fontSize: 16,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};

const sheetBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
  color: "rgba(255,255,255,.7)",
};

const deleteBtnStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 18px",
  borderRadius: 14,
  border: "1px solid rgba(220,60,60,0.55)",
  fontFamily: "inherit",
  fontSize: 16,
  fontWeight: 700,
};

/** The theme's text button, at least 44 px tall to tap (as in SkipSheet). */
const keepBtnStyle: CSSProperties = { ...secondaryLinkStyle, minHeight: 44 };
