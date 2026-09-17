"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type JSX,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import { vibeRequest } from "@/lib/feedback/request";
import type { CampusMajors } from "@/lib/iu/majors";
import type { OnboardingTypedFields, OnboardingYear } from "@/lib/onboarding/draft";

import { ONB_COPY } from "./onb-copy";
import {
  COLORS,
  fieldErrorStyle,
  formStyle,
  h2Style,
  inputStyle,
  labelStyle,
  subIntroStyle,
  textareaStyle,
} from "./onb-theme";

/**
 * Onboarding step 3, the profile (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 9).
 *
 * All nine profile fields, name and handle required. The values and every
 * error live in the parent (`OnboardingMobile`), so Back, the skip sheet and
 * a reload (through the draft) all see the same text. The root is a fragment
 * from the `h2` down: the parent renders the `<section>`, the Otto orb and
 * the footer's Continue, which saves through `profileStepBody`.
 *
 * The handle check is a hook (`useHandleCheck`) the PARENT calls, so its
 * status survives this step unmounting and the skip sheet's handle input can
 * share it. A failed check never reads "taken" (critic D5).
 *
 * No field is focused on its own: focusing one on step entry pops the keyboard
 * and scrolls the pinned header away. The parent focuses a field only in
 * answer to a Continue tap that found it empty or wrong.
 *
 * The strings below that aren't in `ONB_COPY` (placeholders, hints, year and
 * "What are you here for?" options, the check's failure line) are mirrored
 * character for character by `public/html/onboarding.html` (B13).
 */

/** 3–20 lowercase letters, numbers or _ (the server's `HANDLE_FORMAT_RE`). */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export const LOOKING_FOR_OPTIONS = [
  { value: "meeting-people", label: "Meeting people" },
  { value: "showing-work", label: "Showing my work" },
  { value: "finding-clubs", label: "Finding clubs" },
  { value: "exploring", label: "Just exploring" },
] as const;

export const YEAR_OPTIONS: readonly { value: OnboardingYear; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "1", label: "1st year" },
  { value: "2", label: "2nd year" },
  { value: "3", label: "3rd year" },
  { value: "4", label: "4th year" },
  { value: "5", label: "5th+ / grad" },
];

export const PROFILE_PLACEHOLDERS = {
  name: "How you want to appear on Vibe",
  handle: "yourhandle",
  bio: "A few lines about you — what you're into, what you're building.",
  major: "e.g. Informatics",
  department: "e.g. Luddy School of Informatics…",
  interests: "Clubs, side projects, topics",
  skills: "e.g. Figma, Python, public speaking",
} as const;

export const PROFILE_HINTS = {
  handle: "how friends find you (3-20, letters/numbers/_)",
  bio: "up to 600 characters",
  interests: "up to 10 items — comma or new-line separated",
  skills: "up to 12 items, 30 chars each",
} as const;

export const HANDLE_CHECK_FAILED = "Couldn't check that handle.";

export type ProfileFields = Omit<OnboardingTypedFields, "campus_id">;

export type HandleStatus = {
  kind: "checking" | "available" | "taken" | "reason" | "format" | "unchecked";
  text: string;
} | null;

/** Narrow a select value to a year the draft and the server accept. */
export function asOnboardingYear(value: unknown): OnboardingYear {
  return YEAR_OPTIONS.some((o) => o.value === value) ? (value as OnboardingYear) : "";
}

function splitLinesToArray(
  raw: string,
  maxItems: number,
  maxLen: number,
): string[] | undefined {
  const parts = raw
    .split(/\n|,/)
    .map((s) => s.trim().slice(0, maxLen))
    .filter(Boolean);
  if (!parts.length) return undefined;
  return parts.slice(0, maxItems);
}

/**
 * The body of `POST /api/me/onboarding-step {step:"profile"}`. Every key is
 * always sent: an empty value clears that column on purpose, so going Back
 * and erasing a bio really erases it.
 */
export function profileStepBody(f: ProfileFields) {
  return {
    name: f.name.trim(),
    handle: f.handle,
    bio: f.bio,
    major: f.major,
    department: f.department,
    year: f.year === "" ? null : Number(f.year),
    interests: splitLinesToArray(f.interests, 10, 40) ?? [],
    skills: splitLinesToArray(f.skills, 12, 30) ?? [],
    looking_for: f.looking_for,
  };
}

/**
 * The step-3 client checks, in order: a name, a handle, a well-formed handle.
 * Null when both pass. Shared by Continue, the skip sheet and Finish.
 */
export function identityProblem(
  f: Pick<ProfileFields, "name" | "handle">,
): { field: "name" | "handle"; message: string } | null {
  const e = ONB_COPY.profile.errors;
  if (!f.name.trim()) return { field: "name", message: e.nameRequired };
  if (!f.handle) return { field: "handle", message: e.handleRequired };
  if (!HANDLE_RE.test(f.handle)) return { field: "handle", message: e.handleInvalid };
  return null;
}

/**
 * Which step-3 field a refusal from the step route or onboarding-complete
 * belongs to, by `code` (a `VibeFailure` carries no `field`). Null for
 * everything else.
 */
export function profileFieldForCode(code: string | null | undefined): "name" | "handle" | null {
  if (code === "name_required") return "name";
  if (
    code === "handle_required" ||
    code === "handle_invalid" ||
    code === "handle_reserved" ||
    code === "handle_taken" ||
    code === "handle_cooldown"
  ) {
    return "handle";
  }
  return null;
}

/**
 * The live handle check. `onHandleInput(raw)` normalizes the text (trimmed,
 * lowercased, 20 characters), cancels any check still waiting or in flight,
 * sets the status, and returns the normalized value for the caller to store.
 * A well-formed handle is checked 280 ms after the last keystroke.
 */
export function useHandleCheck(): {
  status: HandleStatus;
  setStatus: Dispatch<SetStateAction<HandleStatus>>;
  onHandleInput: (raw: string) => string;
} {
  const [status, setStatus] = useState<HandleStatus>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onHandleInput = useCallback((raw: string): string => {
    const v = raw.trim().toLowerCase().slice(0, 20);
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const copy = ONB_COPY.profile;
    if (v === "") {
      setStatus(null);
      return v;
    }
    if (!HANDLE_RE.test(v)) {
      setStatus({ kind: "format", text: copy.handleFormat });
      return v;
    }
    setStatus({ kind: "checking", text: copy.handleChecking });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        const r = await vibeRequest<{ available?: unknown; reason?: unknown }>(
          `/api/handle/check?h=${encodeURIComponent(v)}`,
          { cache: "no-store", quiet: true, failure: HANDLE_CHECK_FAILED, signal: ctrl.signal },
        );
        if (ctrl.signal.aborted) return;
        if (!r.ok) {
          setStatus({ kind: "unchecked", text: copy.handleUnchecked });
        } else if (r.data.available === true) {
          setStatus({ kind: "available", text: copy.handleAvailable });
        } else {
          const reason = String(r.data.reason ?? "taken").toLowerCase();
          setStatus(
            reason === "taken"
              ? { kind: "taken", text: copy.handleTaken }
              : { kind: "reason", text: copy.handleReason.replace("{reason}", () => reason) },
          );
        }
      })();
    }, 280);
    return v;
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { status, setStatus, onHandleInput };
}

/** Status colour: green when free, red when it can't be used, muted otherwise. */
export function handleStatusColor(status: HandleStatus): string {
  if (!status) return COLORS.mutedText;
  if (status.kind === "available") return COLORS.green;
  if (status.kind === "taken" || status.kind === "reason" || status.kind === "format") return COLORS.red;
  return COLORS.mutedText;
}

export function StepProfile(p: {
  fields: ProfileFields;
  onField: <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => void;
  onHandleInput: (raw: string) => void;
  handleStatus: HandleStatus;
  errors: { name: string | null; handle: string | null };
  nameRef: RefObject<HTMLInputElement | null>;
  handleRef: RefObject<HTMLInputElement | null>;
  majorList: CampusMajors | null;
}): JSX.Element {
  const { fields: f, onField, onHandleInput, handleStatus, errors, nameRef, handleRef, majorList } = p;
  const copy = ONB_COPY.profile;
  const labels = copy.labels;
  const majorHint = majorList
    ? copy.majorHintList.replace("{label}", () => majorList.label)
    : copy.majorHintFree;

  return (
    <>
      <h2 style={h2Style}>{copy.title}</h2>
      <p style={subIntroStyle}>{copy.sub}</p>

      <div style={formStyle}>
        <Field label={labels.name} htmlFor="onbName">
          <input
            id="onbName"
            ref={nameRef}
            type="text"
            value={f.name}
            onChange={(e) => onField("name", e.target.value)}
            maxLength={120}
            placeholder={PROFILE_PLACEHOLDERS.name}
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "onbNameError" : undefined}
            style={inputStyle}
          />
          {errors.name && (
            <p id="onbNameError" role="alert" style={fieldErrorStyle}>
              {errors.name}
            </p>
          )}
        </Field>

        <Field label={labels.handle} hint={PROFILE_HINTS.handle} htmlFor="onbHandle">
          <div style={handleWrapStyle}>
            <span style={handleAtStyle}>@</span>
            <input
              id="onbHandle"
              ref={handleRef}
              type="text"
              value={f.handle}
              onChange={(e) => onHandleInput(e.target.value)}
              maxLength={20}
              placeholder={PROFILE_PLACEHOLDERS.handle}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              aria-invalid={errors.handle ? true : undefined}
              aria-describedby={errors.handle ? "onbHandleError" : undefined}
              style={handleInputStyle}
            />
            {handleStatus && (
              <span aria-live="polite" style={{ ...handleStatusStyle, color: handleStatusColor(handleStatus) }}>
                {handleStatus.text}
              </span>
            )}
          </div>
          {errors.handle && (
            <p id="onbHandleError" role="alert" style={fieldErrorStyle}>
              {errors.handle}
            </p>
          )}
        </Field>

        <Field label={labels.bio} hint={PROFILE_HINTS.bio} htmlFor="onbBio">
          <textarea
            id="onbBio"
            value={f.bio}
            onChange={(e) => onField("bio", e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={PROFILE_PLACEHOLDERS.bio}
            style={textareaStyle}
          />
        </Field>

        <Field label={labels.major} hint={majorHint} htmlFor="onbMajor">
          <input
            id="onbMajor"
            type="text"
            value={f.major}
            onChange={(e) => onField("major", e.target.value)}
            maxLength={80}
            list={majorList ? "onbMajors" : undefined}
            autoComplete="off"
            placeholder={PROFILE_PLACEHOLDERS.major}
            style={inputStyle}
          />
          {majorList && (
            <datalist id="onbMajors">
              {majorList.majors.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label={labels.department} htmlFor="onbDept">
          <input
            id="onbDept"
            type="text"
            value={f.department}
            onChange={(e) => onField("department", e.target.value)}
            maxLength={120}
            list={majorList ? "onbSchools" : undefined}
            autoComplete="off"
            placeholder={PROFILE_PLACEHOLDERS.department}
            style={inputStyle}
          />
          {majorList && (
            <datalist id="onbSchools">
              {majorList.schools.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label={labels.year} htmlFor="onbYear">
          <select
            id="onbYear"
            value={f.year}
            onChange={(e) => onField("year", asOnboardingYear(e.target.value))}
            style={inputStyle}
          >
            {YEAR_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={labels.interests} hint={PROFILE_HINTS.interests} htmlFor="onbInterests">
          <textarea
            id="onbInterests"
            value={f.interests}
            onChange={(e) => onField("interests", e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={PROFILE_PLACEHOLDERS.interests}
            style={textareaStyle}
          />
        </Field>

        <Field label={labels.skills} hint={PROFILE_HINTS.skills} htmlFor="onbSkills">
          <textarea
            id="onbSkills"
            value={f.skills}
            onChange={(e) => onField("skills", e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={PROFILE_PLACEHOLDERS.skills}
            style={textareaStyle}
          />
        </Field>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>{labels.lookingFor}</legend>
          <div style={lookingForWrapStyle}>
            {LOOKING_FOR_OPTIONS.map((opt) => {
              const checked = f.looking_for.includes(opt.value);
              return (
                <label key={opt.value} style={lookingForRowStyle(checked)}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      onField(
                        "looking_for",
                        e.target.checked
                          ? [...f.looking_for.filter((v) => v !== opt.value), opt.value]
                          : f.looking_for.filter((v) => v !== opt.value),
                      );
                    }}
                    style={{ accentColor: COLORS.accent }}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <p style={changeLaterNoteStyle}>{copy.changeLater}</p>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
        {hint && <span style={hintInlineStyle}>{` — ${hint}`}</span>}
      </label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const hintInlineStyle: CSSProperties = {
  fontWeight: 400,
  color: "rgba(255,255,255,.45)",
};

const changeLaterNoteStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: "italic",
  fontSize: 12,
  color: "rgba(255,255,255,.5)",
  marginTop: 18,
  textAlign: "center",
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

const fieldsetStyle: CSSProperties = {
  border: "none",
  margin: 0,
  padding: 0,
  minWidth: 0,
};
const legendStyle: CSSProperties = {
  ...labelStyle,
  padding: 0,
};

const lookingForWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
function lookingForRowStyle(checked: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    background: checked
      ? "rgba(255,92,53,.12)"
      : COLORS.fieldBg,
    border: `1px solid ${checked ? "rgba(255,92,53,.45)" : COLORS.fieldBorder}`,
    color: "white",
    fontSize: 15,
    cursor: "pointer",
    transition: "background .15s, border-color .15s",
  };
}
