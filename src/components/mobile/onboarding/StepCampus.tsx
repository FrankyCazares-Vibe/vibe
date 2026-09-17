"use client";

import { useState, type CSSProperties, type JSX, type RefObject } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  SYSTEM_LABEL,
  campusPickerSub,
  campusesForSystem,
  isSchoolSystem,
  type SchoolSystem,
} from "@/lib/iu/campuses";

import { ONB_COPY } from "./onb-copy";
import {
  COLORS,
  fieldErrorStyle,
  h2Style,
  hintBelowStyle,
  inputStyle,
  labelStyle,
  primaryCtaStyle,
  secondaryLinkStyle,
  subIntroStyle,
} from "./onb-theme";

/**
 * Onboarding step 2, "which campus is yours?" (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 8).
 *
 * THE CHOICES FOLLOW THE UNIVERSITY THE SCHOOL EMAIL PROVED (ac014a3). Cards
 * come from `campusesForSystem(system)`, so an IU student sees the shared
 * communities (Indianapolis first) and IU's own campuses, a Purdue student the
 * shared ones and Purdue's. Nothing is picked here: the parent starts the pick
 * empty unless the email names one campus (`preselectId`, tagged "from your
 * school email") or the student already confirmed one. There is no campus list
 * in this file.
 *
 * A student with no university on record sees one line and no cards; the
 * parent lets them continue without a campus.
 *
 * PURDUE STUDENT WITH AN IU EMAIL (open question Q8). While an IU student has
 * Indianapolis picked, a link opens an inline panel that sends a code to their
 * @purdue.edu address, verifies it, then re-reads `/api/campuses` so the parent
 * can swap the university without a reload. In replay the panel opens and
 * checks the domain, but Send and Verify send nothing. Agents never submit it
 * on production: it sends a real email.
 *
 * The root is a fragment from the `h2` down; the parent renders the section,
 * the Otto orb and the footer's Continue (which saves the pick). The local
 * strings below are mirrored verbatim by `public/html/onboarding.html` (B13).
 */

/** Identical to the step route's `system_missing` line (`onboarding-step/route.ts`). */
export const SYSTEM_MISSING_COPY =
  "We couldn't match your school email to a university yet. Try again later.";
export const SWITCH_SEND_FAILED = "Couldn't send the code.";
export const SWITCH_VERIFY_FAILED = "Couldn't verify that code.";
export const CAMPUSES_LOAD_FAILED = "Couldn't load your campuses.";

const PURDUE_EMAIL_RE = /^[^\s@]+@purdue\.edu$/i;

export function StepCampus(p: {
  system: SchoolSystem | null;
  campusId: string;
  preselectId: string | null;
  error: string | null;
  replay: boolean;
  /**
   * Something is saving (the campus, or the Purdue panel's Send / Verify). The
   * cards hold still meanwhile, so a tap can't swap the pick under a save or
   * close the panel before its answer arrives.
   */
  busy: boolean;
  groupRef: RefObject<HTMLDivElement | null>;
  onPick: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onSystemChanged: (next: { system: SchoolSystem; currentCampusId: string | null }) => void;
}): JSX.Element {
  const { system, campusId, preselectId, error, replay, busy, groupRef, onPick } = p;
  const copy = ONB_COPY.campus;

  if (system === null) {
    return (
      <>
        <h2 style={h2Style}>{copy.title}</h2>
        <p role="status" style={subIntroStyle}>
          {SYSTEM_MISSING_COPY}
        </p>
      </>
    );
  }

  const label = SYSTEM_LABEL[system];
  const note = copy.note.replace(/\{system\}/g, () => label);
  const showPurdueLink = system === "iu" && campusId === "indianapolis";

  return (
    <>
      <h2 style={h2Style}>{copy.title}</h2>
      <p style={subIntroStyle}>{system === "purdue" ? copy.ottoPurdue : copy.ottoIu}</p>

      <div style={groupWrapStyle}>
        <div
          ref={groupRef}
          role="radiogroup"
          aria-label={copy.title}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "onbCampusError" : "onbCampusNote"}
          style={campusListStyle}
        >
          {campusesForSystem(system).map((c) => {
            const selected = campusId === c.id;
            return (
              <label key={c.id} style={campusCardStyle(selected)}>
                <input
                  type="radio"
                  name="onb-campus"
                  value={c.id}
                  checked={selected}
                  disabled={busy}
                  onChange={() => onPick(c.id)}
                  style={campusRadioStyle}
                />
                <span style={campusTextStyle}>
                  <span style={campusTitleRowStyle}>
                    <span style={campusTitleStyle}>{c.shortName}</span>
                    {c.id === preselectId && <span style={campusTagStyle}>{copy.fromEmailTag}</span>}
                    {!c.isOpen && <span style={campusSoonStyle}>{copy.notOpen}</span>}
                  </span>
                  <span style={campusSubStyle}>{campusPickerSub(c, system)}</span>
                </span>
              </label>
            );
          })}
        </div>
        {error && (
          <p id="onbCampusError" role="alert" style={fieldErrorStyle}>
            {error}
          </p>
        )}
        <p id="onbCampusNote" style={hintBelowStyle}>
          {note}
        </p>
        {showPurdueLink && (
          <PurdueSwitch
            replay={replay}
            onBusy={p.onBusy}
            onSystemChanged={p.onSystemChanged}
          />
        )}
      </div>
    </>
  );
}

/**
 * The @purdue.edu switch: a text link, then an inline panel (email → code).
 * Each request is wrapped in `onBusy(true/false)` so the parent's header and
 * footer hold still while it runs.
 */
function PurdueSwitch(p: {
  replay: boolean;
  onBusy: (busy: boolean) => void;
  onSystemChanged: (next: { system: SchoolSystem; currentCampusId: string | null }) => void;
}): JSX.Element {
  const { replay, onBusy, onSystemChanged } = p;
  const copy = ONB_COPY.campus;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setEmail("");
    setCode("");
    setSent(false);
    setPanelError(null);
  };

  /** After a verified code: read the university back and hand it to the parent. */
  const reread = async () => {
    const r = await vibeRequest<{ system?: unknown; currentCampusId?: unknown }>("/api/campuses", {
      cache: "no-store",
      quiet: true,
      failure: CAMPUSES_LOAD_FAILED,
    });
    if (r.ok && isSchoolSystem(r.data.system)) {
      onSystemChanged({
        system: r.data.system,
        currentCampusId: typeof r.data.currentCampusId === "string" ? r.data.currentCampusId : null,
      });
      toast({ message: copy.switchDone, tone: "info" });
      close();
      return true;
    }
    // The school is verified, but this page can't see it yet: reload, and the
    // new boot carries the new university (the pagehide flush keeps the draft).
    toast({ message: copy.switchDone, tone: "info" });
    window.location.reload();
    return false;
  };

  const send = async () => {
    if (sending || verifying) return;
    const schoolEmail = email.trim();
    if (!PURDUE_EMAIL_RE.test(schoolEmail)) {
      setPanelError(copy.switchWrongDomain);
      return;
    }
    setPanelError(null);
    if (replay) {
      setSent(true);
      return;
    }
    setSending(true);
    onBusy(true);
    const r = await vibeRequest<{ alreadyVerified?: unknown }>("/api/auth/school-email/request", {
      method: "POST",
      json: { schoolEmail },
      quiet: true,
      failure: SWITCH_SEND_FAILED,
    });
    if (r.ok && r.data.alreadyVerified === true) {
      await reread();
      setSending(false);
      onBusy(false);
      return;
    }
    setSending(false);
    onBusy(false);
    if (!r.ok) {
      // A 429 carries its own line in `error` ("You've asked for 3 emails…").
      setPanelError(r.error ?? r.message);
      return;
    }
    setSent(true);
  };

  const verify = async () => {
    if (sending || verifying || code.length !== 8) return;
    setPanelError(null);
    if (replay) {
      toast({ message: copy.switchDone, tone: "info" });
      close();
      return;
    }
    setVerifying(true);
    onBusy(true);
    const r = await vibeRequest("/api/auth/school-email/confirm-code", {
      method: "POST",
      json: { schoolEmail: email.trim(), code },
      quiet: true,
      failure: SWITCH_VERIFY_FAILED,
    });
    if (r.ok) await reread();
    setVerifying(false);
    onBusy(false);
    if (!r.ok) setPanelError(r.error ?? r.message);
  };

  if (!open) {
    return (
      <button type="button" style={switchLinkStyle} onClick={() => setOpen(true)}>
        {copy.purdueLink}
      </button>
    );
  }

  const working = sending || verifying;
  return (
    <div style={panelStyle}>
      <label htmlFor="onbPurdueEmail" style={labelStyle}>
        {copy.switchLabel}
      </label>
      <input
        id="onbPurdueEmail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={copy.switchPlaceholder}
        disabled={working || sent}
        style={inputStyle}
      />
      {!sent && (
        <button type="button" style={panelPrimaryStyle} disabled={working} onClick={() => void send()}>
          {sending ? copy.switchSending : copy.switchSend}
        </button>
      )}
      {sent && (
        <>
          <p role="status" style={hintBelowStyle}>
            {copy.switchSent}
          </p>
          <label htmlFor="onbPurdueCode" style={{ ...labelStyle, marginTop: 6 }}>
            {copy.switchCodeLabel}
          </label>
          <input
            id="onbPurdueCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            maxLength={8}
            disabled={working}
            style={inputStyle}
          />
          <button
            type="button"
            style={panelPrimaryStyle}
            disabled={working || code.length !== 8}
            onClick={() => void verify()}
          >
            {verifying ? copy.switchVerifying : copy.switchVerify}
          </button>
        </>
      )}
      {panelError && (
        <p role="alert" style={fieldErrorStyle}>
          {panelError}
        </p>
      )}
      <button type="button" style={switchCancelStyle} disabled={working} onClick={close}>
        {copy.switchCancel}
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const groupWrapStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  marginTop: 4,
};

// One radio card per campus the student may call home: title = short name,
// sub-line = the shared-community copy ("IU Indianapolis · one community with
// Purdue Indianapolis (formerly IUPUI)") or the full name. Cards clear 44 px
// so they're a comfortable tap, and the whole card is the label.
const campusListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
function campusCardStyle(selected: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 56,
    padding: "12px 14px",
    borderRadius: 12,
    background: selected ? "rgba(255,92,53,.12)" : COLORS.fieldBg,
    border: `1px solid ${selected ? "rgba(255,92,53,.45)" : COLORS.fieldBorder}`,
    color: "white",
    cursor: "pointer",
    transition: "background .15s, border-color .15s",
  };
}
const campusRadioStyle: CSSProperties = {
  accentColor: COLORS.accent,
  width: 18,
  height: 18,
  marginTop: 2,
  flexShrink: 0,
};
const campusTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};
const campusTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};
const campusTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
};
const campusSubStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,.55)",
};
const campusPillBase: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  borderRadius: 999,
  padding: "2px 7px",
  whiteSpace: "nowrap",
};
const campusTagStyle: CSSProperties = {
  ...campusPillBase,
  color: COLORS.lavender,
  background: "rgba(200,184,255,.12)",
  border: "1px solid rgba(200,184,255,.30)",
};
const campusSoonStyle: CSSProperties = {
  ...campusPillBase,
  color: "rgba(255,255,255,.55)",
  background: "rgba(255,255,255,.06)",
  border: `1px solid ${COLORS.faintBorder}`,
};

// ── Purdue switch ─────────────────────────────────────────────────────────
const switchLinkStyle: CSSProperties = {
  ...secondaryLinkStyle,
  minHeight: 44,
  marginTop: 10,
  padding: "10px 4px",
  color: COLORS.lavender,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  lineHeight: 1.4,
};
const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,.03)",
  border: `1px solid ${COLORS.fieldBorder}`,
};
const panelPrimaryStyle: CSSProperties = {
  ...primaryCtaStyle,
  marginTop: 4,
  boxShadow: "none",
};
const switchCancelStyle: CSSProperties = {
  ...secondaryLinkStyle,
  minHeight: 44,
};
