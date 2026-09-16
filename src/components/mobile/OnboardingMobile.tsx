"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";

import { isSafeRelativePath } from "@/lib/auth/login-next";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  DEFAULT_CAMPUS_ID,
  IU_CAMPUSES,
  SYSTEM_LABEL,
  campusPickerSub,
  campusesForSystem,
  isCampusAllowed,
  isSchoolSystem,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { IU_MAJORS_BY_SCHOOL, majorsForCampus } from "@/lib/iu/majors";
import type { OnboardingBoot } from "@/lib/onboarding/boot";

/**
 * Mobile-native Otto onboarding. Mirrors the 4-step desktop flow
 * served from `public/html/onboarding.html` (Otto intro → quick
 * profile → work experience → resume / portfolio) but laid out
 * single-column with a sticky bottom CTA so it fits cleanly on a
 * phone screen. Same field set, same APIs, same submit payload.
 *
 * Desktop continues to serve the static HTML at `/onboarding/classic`
 * inside an iframe via `OnboardingSwitch` — this component only paints
 * on mobile viewports.
 *
 * THE CAMPUS FIELD IS SYSTEM-AWARE (plan 2026-09-15 §3.4 step 2 / §3.5).
 * The choices are the allowed set for the university the student's school
 * email proved — `boot.system`, stamped server-side at verification — with
 * the shared communities first (Indianapolis, then Fort Wayne). Purdue
 * signups are on, so a hardcoded IU list would offer a @purdue.edu student
 * only IU campuses and land them campus-less with the wrong university's
 * label. Nothing is preselected except the visible single-campus preselect
 * the boot data names (@pfw.edu / @pnw.edu), which the student still
 * confirms. A student with no stamped system (a pre-migration row) keeps the
 * legacy IU list exactly as it was.
 */

const TOTAL_STEPS = 4;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

const LOOKING_FOR_OPTIONS = [
  { value: "meeting-people", label: "Meeting people" },
  { value: "showing-work", label: "Showing my work" },
  { value: "finding-clubs", label: "Finding clubs" },
  { value: "exploring", label: "Just exploring" },
] as const;

const COLORS = {
  charcoal: "#1C1C1E",
  charcoalSoft: "#26252A",
  cream: "#FAF7F2",
  accent: "#FF5C35",
  purple: "#7C5CFC",
  lavender: "#C8B8FF",
  green: "#1A9E5B",
  red: "#C54323",
  mutedText: "rgba(255,255,255,.55)",
  faintBorder: "rgba(255,255,255,.10)",
  fieldBg: "rgba(255,255,255,.04)",
  fieldBorder: "rgba(255,255,255,.10)",
  fieldFocusBorder: "rgba(255,92,53,.55)",
};

type WorkRow = {
  company: string;
  title: string;
  dates: string;
  location: string;
  description: string;
};

const EMPTY_ROW: WorkRow = {
  company: "",
  title: "",
  dates: "",
  location: "",
  description: "",
};

/** Flatten the IU-Indianapolis grouped majors list into a sorted array. */
const ALL_IU_MAJORS = (() => {
  const set = new Set<string>();
  for (const group of IU_MAJORS_BY_SCHOOL) {
    for (const m of group.majors) set.add(m);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
})();

const ALL_IU_SCHOOLS = IU_MAJORS_BY_SCHOOL.map((g) => g.school.label);

/**
 * The legacy fallback, used ONLY when no school system is stamped: campus is
 * self-declared, an @iu.edu address proves IU membership and not which
 * campus, so the old picker stored the canonical label and defaulted to the
 * pilot campus. A student whose system IS known never sees this — they get
 * their own university's campuses, with nothing defaulted.
 */
const DEFAULT_CAMPUS_LABEL =
  IU_CAMPUSES.find((c) => c.id === DEFAULT_CAMPUS_ID)?.label ?? "";

/** Client copy for the campus field (plan §3.5, "Step 2 errors"). */
const CAMPUS_REQUIRED_COPY = "Pick your campus to continue.";
/** Mirrors the server's `campus_invalid` line, used when the pick can't stand. */
const CAMPUS_INVALID_COPY = "Pick one of your university's campuses.";

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

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Otto's saved config. Finish and Skip both send it: any non-empty
 * `otto_answers` marks onboarding done (`isOttoOnboardingComplete`).
 */
function buildOttoConfig() {
  return {
    name: "otto",
    platforms: [] as string[],
    voiceSamples: [] as string[],
    leash: "ask",
    setupAt: new Date().toISOString(),
  };
}

// ── Otto orb ────────────────────────────────────────────────────────────────
function OttoOrb({ size }: { size: "big" | "small" }) {
  const px = size === "big" ? 132 : 64;
  const corePx = size === "big" ? 16 : 10;
  return (
    <div
      style={{
        position: "relative",
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginBottom: size === "big" ? 22 : 16,
      }}
    >
      {/* Pulse rings */}
      <span className="otto-pulse otto-pulse-1" />
      <span className="otto-pulse otto-pulse-2" />
      {/* Spinning orbit */}
      <span className="otto-orbit">
        <span className="otto-orbit-dot" />
      </span>
      {/* Core */}
      <span
        style={{
          width: corePx,
          height: corePx,
          borderRadius: "50%",
          background: COLORS.accent,
          boxShadow: `0 0 ${size === "big" ? 22 : 14}px ${COLORS.accent}, 0 0 ${size === "big" ? 36 : 22}px rgba(124,92,252,.5)`,
          animation: "otto-core-pulse 2.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * What `/onboarding` hands the phone tree. Every boot field is OPTIONAL and
 * the flow still works without it (a caller that only knows `replay` gets
 * today's behaviour), which is the shape `OnboardingSwitch` already types.
 */
export type OnboardingMobileProps = { replay: boolean } & Partial<
  Omit<OnboardingBoot, "replay">
>;

export function OnboardingMobile({
  replay,
  system: systemProp,
  prefill,
  singleCampusId,
}: OnboardingMobileProps) {
  const [step, setStep] = useState(1);

  // ── Campus (boot data) ───────────────────────────────────────────────────
  // The verified university. Null when nothing is stamped yet: that student
  // keeps the legacy IU list and its "IU Indianapolis" default.
  const system: SchoolSystem | null = isSchoolSystem(systemProp)
    ? systemProp
    : null;

  /** The allowed set as picker cards — shared communities first (§2.4). */
  const campusOptions = useMemo(() => {
    if (!system) return [];
    return campusesForSystem(system).map((c) => ({
      id: c.id,
      title: c.shortName,
      sub: campusPickerSub(c, system),
      isOpen: c.isOpen,
    }));
  }, [system]);

  /** True when we can ask the real question instead of the legacy IU list. */
  const systemAware = campusOptions.length > 0;

  /**
   * The one campus that may start selected: the @pfw.edu / @pnw.edu single-
   * campus preselect, which is VISIBLE and still confirmed by the student.
   * Re-checked against the system here — the server already did (§3.4).
   */
  const preselectId = isCampusAllowed(singleCampusId, system)
    ? (singleCampusId ?? null)
    : null;

  // Step 2 — Profile draft
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<{
    text: string;
    color: string;
  } | null>(null);
  const [bio, setBio] = useState("");
  /** Legacy label, only ever sent when the system is unknown. */
  const [campus, setCampus] = useState(() =>
    isSchoolSystem(systemProp) ? "" : DEFAULT_CAMPUS_LABEL,
  );
  /**
   * The system-aware pick. Starts empty — nothing is chosen for the student —
   * except the visible single-campus preselect, or a campus they have already
   * chosen and confirmed (`campus_set_at` is stamped). A campus that was
   * backfilled silently is deliberately NOT preselected: that would be the
   * same silent default again, and the student is meant to confirm it.
   */
  const [campusId, setCampusId] = useState(() => {
    if (!isSchoolSystem(systemProp)) return "";
    if (isCampusAllowed(singleCampusId, systemProp)) return singleCampusId ?? "";
    if (prefill?.campusConfirmed && isCampusAllowed(prefill.campusId, systemProp)) {
      return prefill.campusId ?? "";
    }
    return "";
  });
  const [campusError, setCampusError] = useState<string | null>(null);
  const campusGroupRef = useRef<HTMLDivElement | null>(null);
  const [major, setMajor] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);

  // ── Majors follow the campus ─────────────────────────────────────────────
  // IU Indianapolis for IU in Indianapolis, Purdue Indianapolis for Purdue in
  // the same community, Bloomington for IU Bloomington; anywhere else there is
  // no curated list and the field is plain free text (§3.4 step 3). Both
  // fields stay free text regardless — the list is a suggestion, never a gate.
  const majorList = useMemo(
    () => (system && campusId ? majorsForCampus(campusId, system) : null),
    [system, campusId],
  );
  const majorOptions = majorList
    ? majorList.majors
    : systemAware
      ? []
      : ALL_IU_MAJORS;
  const schoolOptions = majorList
    ? majorList.schools
    : systemAware
      ? []
      : ALL_IU_SCHOOLS;
  const majorHint = majorList
    ? `from the ${majorList.label} list, or type your own`
    : systemAware
      ? "type your own"
      : "start typing — IU Indianapolis list";

  /** §3.5: "Your school email shows you're at IU…" (Purdue variant mirrored). */
  const campusNote = system
    ? `Your school email shows you're at ${SYSTEM_LABEL[system]}. You can move to another ${SYSTEM_LABEL[system]} campus later in Settings.`
    : "";

  /**
   * Bring the campus cards into view when they're the reason the flow stopped.
   * The delay is for the bounce back from Finish: the step-change effect
   * scrolls to the top and focuses the name field first, so this waits until
   * that has settled rather than fighting it.
   */
  const revealCampusField = useCallback((delayMs = 0) => {
    const run = () =>
      campusGroupRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }, []);

  // Step 3 — Work experience
  const [exp1, setExp1] = useState<WorkRow>({ ...EMPTY_ROW });
  const [exp2, setExp2] = useState<WorkRow>({ ...EMPTY_ROW });

  // Step 4 — Resume
  const [resumeUploadedUrl, setResumeUploadedUrl] = useState<string | null>(
    null,
  );
  const [resumeUploadStatus, setResumeUploadStatus] = useState("");
  const [resumeLink, setResumeLink] = useState("");
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);

  // Submit + warp
  const [submitting, setSubmitting] = useState(false);
  const [warping, setWarping] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  // Refs for step-change focus
  const step2NameRef = useRef<HTMLInputElement | null>(null);
  const step3CompanyRef = useRef<HTMLInputElement | null>(null);
  const step4LinkRef = useRef<HTMLInputElement | null>(null);

  // Reset scroll + focus first input on step change.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const t = setTimeout(() => {
      if (step === 2) step2NameRef.current?.focus();
      else if (step === 3) step3CompanyRef.current?.focus();
      else if (step === 4) step4LinkRef.current?.focus();
    }, 280);
    return () => clearTimeout(t);
  }, [step]);

  // ── Handle availability check (debounced) ────────────────────────────────
  // Driven by `onHandleChange` rather than a `useEffect([handle])` so the
  // status updates don't trigger a `set-state-in-effect` lint warning.
  const handleSeq = useRef(0);
  const handleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onHandleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim().toLowerCase().slice(0, 20);
    setHandle(v);
    if (handleTimer.current) clearTimeout(handleTimer.current);
    if (!v) {
      setHandleStatus(null);
      return;
    }
    if (v.length < 3) {
      setHandleStatus({ text: "too short", color: COLORS.red });
      return;
    }
    if (!HANDLE_RE.test(v)) {
      setHandleStatus({ text: "letters / numbers / _", color: COLORS.red });
      return;
    }
    setHandleStatus({ text: "checking…", color: "rgba(255,255,255,.55)" });
    const seq = ++handleSeq.current;
    handleTimer.current = setTimeout(() => {
      fetch(`/api/handle/check?h=${encodeURIComponent(v)}`, {
        credentials: "include",
      })
        .then((r) => r.json())
        .then((j) => {
          if (seq !== handleSeq.current) return;
          if (j && j.ok && j.available) {
            setHandleStatus({ text: "✓ available", color: COLORS.green });
          } else {
            const reason = (j && (j.reason as string)) || "taken";
            setHandleStatus({
              text: `✗ ${String(reason).toLowerCase()}`,
              color: COLORS.red,
            });
          }
        })
        .catch(() => {
          if (seq === handleSeq.current) setHandleStatus(null);
        });
    }, 280);
  }, []);

  // Clear any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (handleTimer.current) clearTimeout(handleTimer.current);
    };
  }, []);

  // ── Resume upload ─────────────────────────────────────────────────────────
  const onResumeFilePick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setResumeUploadStatus("Uploading…");
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("kind", "resume");
        const r = await fetch("/api/me/profile-upload", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
        const j = await r.json();
        if (!r.ok || !j.ok) {
          setResumeUploadStatus(j?.error ? String(j.error) : "Upload failed");
          return;
        }
        setResumeUploadedUrl(j.url);
        setResumeUploadStatus("Uploaded");
      } catch {
        setResumeUploadStatus("Network error");
      }
      // reset the input so the same file can be reselected
      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
    },
    [],
  );

  // Preview URL + mime guess
  const resumePreview = useMemo(() => {
    const url = resumeUploadedUrl ?? (resumeLink.trim() || "");
    if (!url) return null;
    if (resumeUploadedUrl) {
      const isPdf = /\.pdf(\?|#|$)/i.test(url);
      return { url, isPdf };
    }
    if (!isHttpUrl(url)) return null;
    const lower = url.toLowerCase();
    if (/\.pdf(\?|#|$)/i.test(lower)) return { url, isPdf: true };
    if (/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(lower)) {
      return { url, isPdf: false };
    }
    return null;
  }, [resumeUploadedUrl, resumeLink]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const completeOnboarding = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    const profile: Record<string, unknown> = {};
    const n = name.trim();
    if (n) profile.name = n.slice(0, 120);
    // The campus only rides along as a legacy label when the system is
    // unknown; a known system saves it through the campus step below, which
    // is the only writer that understands the campus model (a new id or a
    // Purdue label in `profile.school` would be refused outright).
    if (!systemAware) {
      const c = campus.trim();
      if (c) profile.school = c;
    }
    const m = major.trim();
    if (m) profile.major = m.slice(0, 80);
    const d = department.trim();
    if (d) profile.department = d.slice(0, 120);
    if (year) {
      const y = parseInt(year, 10);
      if (Number.isInteger(y) && y >= 1 && y <= 12) profile.year = y;
    }
    const b = bio.trim();
    if (b) profile.bio = b.slice(0, 600);
    const ints = splitLinesToArray(interests, 10, 40);
    if (ints) profile.interests = ints;
    const sks = splitLinesToArray(skills, 12, 30);
    if (sks) profile.skills = sks;
    if (lookingFor.length) profile.looking_for = lookingFor;

    const workRows: WorkRow[] = [];
    for (const row of [exp1, exp2]) {
      const company = row.company.trim();
      const title = row.title.trim();
      if (!company && !title) continue;
      workRows.push({
        company: company.slice(0, 200),
        title: title.slice(0, 200),
        dates: row.dates.trim().slice(0, 120),
        location: row.location.trim().slice(0, 200),
        description: row.description.trim().slice(0, 4000),
      });
    }
    if (workRows.length) profile.work_experience = workRows;

    const linkResume = resumeLink.trim();
    const resumeFinal =
      resumeUploadedUrl || (linkResume ? linkResume.slice(0, 2048) : "");
    if (resumeFinal) profile.resume_url = resumeFinal;

    const ottoConfig = buildOttoConfig();

    // Replay mode: skip the server save (returning user re-viewing the flow)
    if (replay) {
      setWarping(true);
      setTimeout(() => {
        window.location.href = "/profile";
      }, 700);
      return;
    }

    // ── Campus, for a student whose university we know ─────────────────────
    // POST /api/me/onboarding-step is the only route that writes the campus
    // model, and it refuses a campus outside the student's system. So the
    // campus goes here, first: Finish can never write one that isn't theirs,
    // and a refusal comes back to the field instead of saving silently.
    if (systemAware) {
      const chosen = campusId.trim();
      if (!chosen || !isCampusAllowed(chosen, system)) {
        const message = chosen ? CAMPUS_INVALID_COPY : CAMPUS_REQUIRED_COPY;
        setCampusError(message);
        toast({ message, tone: "error" });
        setStep(2);
        revealCampusField(360);
        setSubmitting(false);
        return;
      }
      const savedCampus = await vibeRequest("/api/me/onboarding-step", {
        method: "POST",
        json: { step: "campus", campus_id: chosen },
        failure: "Couldn't save your campus.",
        quiet: true,
      });
      if (!savedCampus.ok) {
        const code = savedCampus.code;
        // The server won't take this campus: say so on the field, in the
        // server's own words ("Pick one of your university's campuses.", "You
        // changed your campus recently."). The generic mapped line would send
        // them to retry a request that will be refused again.
        if (code === "campus_invalid" || code === "campus_change_too_soon") {
          const line = savedCampus.error ?? CAMPUS_INVALID_COPY;
          setCampusError(line);
          toast({ message: line, tone: "error" });
          setStep(2);
          revealCampusField(360);
          setSubmitting(false);
          return;
        }
        // The campus columns aren't there yet, or the row carries no system:
        // nothing the student can fix, and finishing without a campus is
        // recoverable (Settings asks again). Everything else — offline, a
        // 500, a rate limit — keeps their answers on screen so Finish retries.
        if (code !== "campus_not_ready" && code !== "system_missing") {
          toast({
            message: savedCampus.message,
            tone: "error",
            action: savedCampus.action,
          });
          setSubmitting(false);
          return;
        }
        // Finishing without a campus is recoverable, but not silent: say what
        // didn't save before carrying on.
        toast({
          message: "We couldn't set your campus yet. You can pick it in Settings.",
          tone: "info",
        });
      }
    }

    // The warp waits for the save. A refusal keeps every answer on screen
    // and the toast says why, with Review Terms for the consent gate (S53
    // A4) and Sign in for a 401, so there's no blind fall-through to login.
    const saved = await vibeRequest<{ next?: unknown }>(
      "/api/me/onboarding-complete",
      {
        method: "POST",
        json: {
          otto_answers: ottoConfig,
          profile: Object.keys(profile).length ? profile : undefined,
        },
        failure: "Couldn't save your profile.",
      },
    );
    if (!saved.ok) {
      setSubmitting(false);
      return;
    }

    // Handle claim (separate route — has own validation). The profile is
    // saved by now, but a handle that didn't stick is said before leaving:
    // taken (409) or rejected (400, e.g. reserved) goes back to step 2 to
    // pick another; anything else stays here so Finish can try again.
    const claimed = handle.trim().toLowerCase();
    if (claimed && HANDLE_RE.test(claimed)) {
      const claim = await vibeRequest("/api/me/handle", {
        method: "PATCH",
        json: { handle: claimed },
        failure: "Couldn't save your handle.",
        quiet: true,
      });
      if (!claim.ok) {
        if (claim.status === 409 || claim.status === 400) {
          const taken = claim.status === 409;
          setHandleStatus({
            text: `✗ ${taken ? "taken" : (claim.error ?? "not allowed").toLowerCase()}`,
            color: COLORS.red,
          });
          toast({
            message: taken
              ? "That handle is taken. Pick another one."
              : "That handle won't work. Pick another one.",
            tone: "error",
          });
          setStep(2);
        } else {
          toast({ message: claim.message, tone: "error", action: claim.action });
        }
        setSubmitting(false);
        return;
      }
    }

    const next = typeof saved.data.next === "string" ? saved.data.next : null;
    const nextHref = isSafeRelativePath(next)
      ? `${next}${next.includes("?") ? "&" : "?"}welcome=1`
      : "/profile?welcome=1";
    setWarping(true);
    setTimeout(() => {
      window.location.href = nextHref;
    }, 700);
  }, [
    submitting,
    name,
    handle,
    bio,
    campus,
    campusId,
    system,
    systemAware,
    revealCampusField,
    major,
    department,
    year,
    interests,
    skills,
    lookingFor,
    exp1,
    exp2,
    resumeUploadedUrl,
    resumeLink,
    replay,
  ]);

  // ── Skip ──────────────────────────────────────────────────────────────────
  // Every app page sends a student back here until otto_answers is saved,
  // so leaving without saving reloads this page at step 1 with the answers
  // gone. Skip saves Otto's config and no profile, then goes where the
  // server says. A refusal keeps the sheet open and the toast says why.
  const skipOnboarding = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    // Replay mode never saves, same as Finish.
    let dest = "/profile";
    if (!replay) {
      const skipped = await vibeRequest<{ next?: unknown }>(
        "/api/me/onboarding-complete",
        {
          method: "POST",
          json: { otto_answers: buildOttoConfig() },
          failure: "Couldn't skip onboarding.",
        },
      );
      if (!skipped.ok) {
        setSubmitting(false);
        return;
      }
      const next =
        typeof skipped.data.next === "string" ? skipped.data.next : null;
      if (isSafeRelativePath(next)) dest = next;
    }
    window.location.href = dest;
  }, [submitting, replay]);

  /**
   * Leaving step 2 with the campus question unanswered. Same rule Finish
   * enforces, said early so the student isn't bounced back from the last
   * screen. Always true when the system is unknown — that student sees the
   * legacy picker, which is never empty.
   */
  const campusAnswered = useCallback(() => {
    if (!systemAware) return true;
    const chosen = campusId.trim();
    if (chosen && isCampusAllowed(chosen, system)) return true;
    setCampusError(chosen ? CAMPUS_INVALID_COPY : CAMPUS_REQUIRED_COPY);
    revealCampusField();
    return false;
  }, [systemAware, campusId, system, revealCampusField]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const progressDots = (
    <div style={progressDotsStyle}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const idx = i + 1;
        const state =
          idx < step ? "done" : idx === step ? "now" : "pending";
        return <span key={i} style={dotStyle(state)} />;
      })}
      <span style={progressTextStyle}>
        {step} of {TOTAL_STEPS}
      </span>
    </div>
  );

  return (
    <div style={shellStyle}>
      <StyleTag />

      {/* Soft glow accents in the background */}
      <span style={bg1Style} />
      <span style={bg2Style} />

      {/* Top bar */}
      <header style={topBarStyle}>
        <div style={logoStyle}>
          vibe<span style={{ color: COLORS.accent }}>.</span>
        </div>
        {progressDots}
        {step > 1 && (
          <button
            type="button"
            style={skipBtnStyle}
            disabled={submitting}
            onClick={() => setSkipOpen(true)}
          >
            Skip
          </button>
        )}
        {step === 1 && <span style={{ width: 44 }} />}
      </header>

      {replay && <div style={replayPillStyle}>REPLAY MODE</div>}

      <main style={mainStyle}>
        {/* ── Step 1 — Otto intro ──────────────────────────────────────── */}
        {step === 1 && (
          <section style={stepSectionStyle}>
            <OttoOrb size="big" />
            <h1 style={h1Style}>
              {"i'm "}<em style={emStyle}>otto</em>.
            </h1>
            <p style={introStyle}>
              {"“think of me as your campus compass. i'll point you to what's loud, what's tonight, and who's on your wavelength — your guide while you build out your home on vibe.”"}
            </p>
            <p style={noteStyle}>
              about two minutes — profile, experience, then your documents
            </p>
          </section>
        )}

        {/* ── Step 2 — Quick profile ───────────────────────────────────── */}
        {step === 2 && (
          <section style={stepSectionStyle}>
            <OttoOrb size="small" />
            <h2 style={h2Style}>{"let's pin down your profile"}</h2>
            <p style={subIntroStyle}>
              {"“same fields as your Vibe profile — a quick pass now; photo, banner, and fine-tuning on the next screen.”"}
            </p>

            <div style={formStyle}>
              <Field label="Name">
                <input
                  ref={step2NameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="How you want to appear on Vibe"
                  autoComplete="name"
                  style={inputStyle}
                />
              </Field>

              <Field
                label="Handle"
                hint="how friends find you (3-20, letters/numbers/_)"
              >
                <div style={handleWrapStyle}>
                  <span style={handleAtStyle}>@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={onHandleChange}
                    maxLength={20}
                    placeholder="yourhandle"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    style={{
                      flex: 1,
                      border: "none",
                      background: "none",
                      color: "white",
                      fontSize: 16,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  {handleStatus && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: handleStatus.color,
                      }}
                    >
                      {handleStatus.text}
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Bio" hint="up to 600 characters">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="A few lines about you — what you're into, what you're building."
                  style={textareaStyle}
                />
              </Field>

              {systemAware ? (
                <Field label="Which campus is yours?">
                  <div
                    ref={campusGroupRef}
                    role="radiogroup"
                    aria-label="Which campus is yours?"
                    aria-invalid={campusError ? true : undefined}
                    aria-describedby={
                      campusError ? "onbCampusError" : "onbCampusNote"
                    }
                    style={campusListStyle}
                  >
                    {campusOptions.map((opt) => {
                      const selected = campusId === opt.id;
                      return (
                        <label key={opt.id} style={campusCardStyle(selected)}>
                          <input
                            type="radio"
                            name="onb-campus"
                            value={opt.id}
                            checked={selected}
                            onChange={() => {
                              setCampusId(opt.id);
                              setCampusError(null);
                            }}
                            style={campusRadioStyle}
                          />
                          <span style={campusTextStyle}>
                            <span style={campusTitleRowStyle}>
                              <span style={campusTitleStyle}>{opt.title}</span>
                              {opt.id === preselectId && (
                                <span style={campusTagStyle}>
                                  from your school email
                                </span>
                              )}
                              {!opt.isOpen && (
                                <span style={campusSoonStyle}>not open yet</span>
                              )}
                            </span>
                            <span style={campusSubStyle}>{opt.sub}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {campusError && (
                    <p id="onbCampusError" role="alert" style={fieldErrorStyle}>
                      {campusError}
                    </p>
                  )}
                  <p id="onbCampusNote" style={hintBelowStyle}>
                    {campusNote}
                  </p>
                </Field>
              ) : (
                <Field
                  label="Which campus are you at?"
                  hint="not verified; you can change this any time in settings"
                >
                  <select
                    value={campus}
                    onChange={(e) => setCampus(e.target.value)}
                    style={inputStyle}
                  >
                    {IU_CAMPUSES.map((c) => (
                      <option key={c.id} value={c.label}>
                        {c.city && c.city !== c.label.replace(/^IU /, "")
                          ? `${c.label} — ${c.city}`
                          : c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Major" hint={majorHint}>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  maxLength={80}
                  list={majorOptions.length ? "onbIuMajors" : undefined}
                  autoComplete="off"
                  placeholder="e.g. Informatics"
                  style={inputStyle}
                />
                {majorOptions.length > 0 && (
                  <datalist id="onbIuMajors">
                    {majorOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </Field>

              <Field label="Department / school" hint="optional">
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={120}
                  list={schoolOptions.length ? "onbIuSchools" : undefined}
                  autoComplete="off"
                  placeholder="e.g. Luddy School of Informatics…"
                  style={inputStyle}
                />
                {schoolOptions.length > 0 && (
                  <datalist id="onbIuSchools">
                    {schoolOptions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                )}
              </Field>

              <Field label="Year">
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Prefer not to say</option>
                  <option value="1">1st year</option>
                  <option value="2">2nd year</option>
                  <option value="3">3rd year</option>
                  <option value="4">4th year</option>
                  <option value="5">5th+ / grad</option>
                </select>
              </Field>

              <Field
                label="Interests & projects"
                hint="up to 10 items — comma or new-line separated"
              >
                <textarea
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="Clubs, side projects, topics"
                  style={textareaStyle}
                />
              </Field>

              <Field
                label="Skills"
                hint="up to 12 items, 30 chars each"
              >
                <textarea
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="e.g. Figma, Python, public speaking"
                  style={textareaStyle}
                />
              </Field>

              <Field label="What are you here for?">
                <div style={lookingForWrapStyle}>
                  {LOOKING_FOR_OPTIONS.map((opt) => {
                    const checked = lookingFor.includes(opt.value);
                    return (
                      <label key={opt.value} style={lookingForRowStyle(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setLookingFor((prev) =>
                              e.target.checked
                                ? [...prev, opt.value]
                                : prev.filter((v) => v !== opt.value),
                            );
                          }}
                          style={{ accentColor: COLORS.accent }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            </div>
            <p style={changeLaterNoteStyle}>you can change anything later</p>
          </section>
        )}

        {/* ── Step 3 — Work experience ─────────────────────────────────── */}
        {step === 3 && (
          <section style={stepSectionStyle}>
            <OttoOrb size="small" />
            <h2 style={h2Style}>
              where have you <em style={emStyle}>worked</em>?
            </h2>
            <p style={subIntroStyle}>
              {"“internships, campus jobs, freelance — whatever counts. Skip if you'd rather add this on your profile.”"}
            </p>

            <div style={formStyle}>
              <ExperienceRow
                label="Role 1"
                value={exp1}
                onChange={setExp1}
                companyRef={step3CompanyRef}
              />
              <ExperienceRow
                label="Role 2"
                optional
                value={exp2}
                onChange={setExp2}
              />
            </div>
            <p style={changeLaterNoteStyle}>
              {"We'll show this in your profile's work section — same layout as the full editor."}
            </p>
          </section>
        )}

        {/* ── Step 4 — Resume / portfolio ──────────────────────────────── */}
        {step === 4 && (
          <section style={stepSectionStyle}>
            <OttoOrb size="small" />
            <h2 style={h2Style}>
              resume or <em style={emStyle}>portfolio</em>
            </h2>
            <p style={subIntroStyle}>
              {"“upload a PDF or image, or paste a link — preview below, same idea as on your profile.”"}
            </p>

            <div style={formStyle}>
              <input
                ref={resumeFileInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                onChange={onResumeFilePick}
                style={{ display: "none" }}
              />
              <button
                type="button"
                style={uploadBtnStyle}
                onClick={() => resumeFileInputRef.current?.click()}
              >
                Upload PDF or image
              </button>
              {resumeUploadStatus && (
                <span style={uploadStatusStyle}>{resumeUploadStatus}</span>
              )}

              <Field label="Or paste a link">
                <input
                  ref={step4LinkRef}
                  type="url"
                  value={resumeLink}
                  onChange={(e) => setResumeLink(e.target.value)}
                  maxLength={2048}
                  placeholder="https://… — optional"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  style={inputStyle}
                />
                <p style={hintBelowStyle}>
                  {"https:// or http:// — if you upload a file, we'll use that unless you clear it."}
                </p>
              </Field>

              {resumePreview && (
                <div style={previewWrapStyle}>
                  <div style={previewLabelStyle}>Preview</div>
                  {resumePreview.isPdf ? (
                    <iframe
                      src={`${resumePreview.url}${resumePreview.url.includes("#") ? "" : "#view=FitH"}`}
                      title="Resume preview"
                      style={previewFrameStyle}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resumePreview.url}
                      alt="Resume preview"
                      style={previewImgStyle}
                    />
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Sticky bottom CTA */}
      <footer style={bottomBarStyle}>
        {step === 1 && (
          <button
            type="button"
            style={primaryCtaStyle}
            onClick={() => setStep(2)}
          >
            {"Let's go →"}
          </button>
        )}
        {step === 2 && (
          <>
            <button
              type="button"
              style={primaryCtaStyle}
              onClick={() => {
                if (campusAnswered()) setStep(3);
              }}
            >
              Continue →
            </button>
            <button
              type="button"
              style={secondaryLinkStyle}
              onClick={() => {
                if (campusAnswered()) setStep(4);
              }}
            >
              Skip to resume →
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <button
              type="button"
              style={primaryCtaStyle}
              onClick={() => setStep(4)}
            >
              Continue →
            </button>
            <button
              type="button"
              style={secondaryLinkStyle}
              onClick={() => setStep(4)}
            >
              Skip
            </button>
          </>
        )}
        {step === 4 && (
          <button
            type="button"
            style={primaryCtaStyle}
            disabled={submitting}
            onClick={completeOnboarding}
          >
            {submitting ? "Saving…" : "Finish & open my profile →"}
          </button>
        )}
      </footer>

      {/* Skip confirm overlay */}
      {skipOpen && (
        <div
          style={skipOverlayStyle}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSkipOpen(false);
          }}
        >
          <div style={skipCardStyle}>
            <div style={skipTitleStyle}>Skip onboarding?</div>
            <div style={skipBodyStyle}>
              {"What you've typed here won't be saved. You can fill in your profile any time from your profile page."}
            </div>
            <div style={skipRowStyle}>
              <button
                type="button"
                style={primaryCtaStyle}
                onClick={() => setSkipOpen(false)}
              >
                Keep going
              </button>
              <button
                type="button"
                style={secondaryLinkStyle}
                disabled={submitting}
                onClick={skipOnboarding}
              >
                {submitting ? "Skipping…" : "Skip anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warp overlay (simplified mobile version of the desktop hyperdrive) */}
      {warping && <div style={warpOverlayStyle} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {hint && <span style={hintInlineStyle}>{` — ${hint}`}</span>}
      </label>
      {children}
    </div>
  );
}

function ExperienceRow({
  label,
  optional,
  value,
  onChange,
  companyRef,
}: {
  label: string;
  optional?: boolean;
  value: WorkRow;
  onChange: (next: WorkRow) => void;
  companyRef?: React.Ref<HTMLInputElement>;
}) {
  const set = <K extends keyof WorkRow>(k: K, v: WorkRow[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div style={expRowStyle}>
      <div style={labelStyle}>
        {label}
        {optional && <span style={hintInlineStyle}> — optional</span>}
      </div>
      <input
        ref={companyRef}
        type="text"
        value={value.company}
        onChange={(e) => set("company", e.target.value)}
        maxLength={200}
        placeholder="Company or org"
        autoComplete="organization"
        style={inputStyle}
      />
      <input
        type="text"
        value={value.title}
        onChange={(e) => set("title", e.target.value)}
        maxLength={200}
        placeholder="Title or role"
        autoComplete="organization-title"
        style={inputStyle}
      />
      <input
        type="text"
        value={value.dates}
        onChange={(e) => set("dates", e.target.value)}
        maxLength={120}
        placeholder="Dates (e.g. Jun 2024 — Aug 2024)"
        style={inputStyle}
      />
      <input
        type="text"
        value={value.location}
        onChange={(e) => set("location", e.target.value)}
        maxLength={200}
        placeholder="Location (optional)"
        style={inputStyle}
      />
      <textarea
        value={value.description}
        onChange={(e) => set("description", e.target.value)}
        maxLength={4000}
        rows={2}
        placeholder="What you did (optional)"
        style={textareaStyle}
      />
    </div>
  );
}

function StyleTag() {
  return (
    <style>{`
      @keyframes otto-core-pulse {
        0%, 100% { transform: scale(1); opacity: .9; }
        50% { transform: scale(1.15); opacity: 1; }
      }
      @keyframes otto-ring-breathe {
        0%, 100% { transform: scale(1); opacity: .3; }
        50% { transform: scale(1.45); opacity: 0; }
      }
      @keyframes otto-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes onb-step-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes onb-warp {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .otto-pulse {
        position: absolute; inset: 14%;
        border-radius: 50%;
        border: 1px solid ${COLORS.accent};
        animation: otto-ring-breathe 2.8s ease-out infinite;
      }
      .otto-pulse-2 {
        border-color: ${COLORS.purple};
        animation-duration: 3.4s;
        animation-delay: .9s;
      }
      .otto-orbit {
        position: absolute; inset: 8%;
        border-radius: 50%;
        border: 0.5px solid rgba(255,92,53,.3);
        animation: otto-spin 8s linear infinite;
      }
      .otto-orbit-dot {
        position: absolute;
        top: 0; left: 50%;
        transform: translateX(-50%);
        width: 4px; height: 4px;
        border-radius: 50%;
        background: ${COLORS.accent};
        box-shadow: 0 0 6px ${COLORS.accent};
      }
    `}</style>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const shellStyle: CSSProperties = {
  position: "relative",
  minHeight: "100dvh",
  background: COLORS.charcoal,
  color: "white",
  fontFamily:
    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  paddingBottom: "calc(140px + env(safe-area-inset-bottom, 0px))",
};

const bg1Style: CSSProperties = {
  position: "absolute",
  top: -180,
  right: -180,
  width: 420,
  height: 420,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(255,92,53,.18) 0%, transparent 70%)",
  pointerEvents: "none",
  zIndex: 0,
};
const bg2Style: CSSProperties = {
  position: "absolute",
  bottom: -120,
  left: -120,
  width: 360,
  height: 360,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(124,92,252,.16) 0%, transparent 70%)",
  pointerEvents: "none",
  zIndex: 0,
};

const topBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
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

const progressDotsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "rgba(255,255,255,.06)",
  border: "0.5px solid rgba(255,255,255,.08)",
  borderRadius: 100,
  backdropFilter: "blur(8px)",
};
function dotStyle(state: "done" | "now" | "pending"): CSSProperties {
  const base: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    transition: "all .35s",
  };
  if (state === "done")
    return {
      ...base,
      background: COLORS.accent,
      boxShadow: `0 0 6px rgba(255,92,53,.4)`,
    };
  if (state === "now")
    return {
      ...base,
      background: COLORS.accent,
      transform: "scale(1.5)",
      boxShadow: `0 0 8px ${COLORS.accent}`,
    };
  return { ...base, background: "rgba(255,255,255,.15)" };
}
const progressTextStyle: CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,.55)",
  marginLeft: 6,
  fontWeight: 500,
  letterSpacing: "0.3px",
};

const skipBtnStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "rgba(255,255,255,.5)",
  background: "none",
  border: "none",
  padding: "8px 4px",
  minWidth: 44,
  textAlign: "right",
};

const replayPillStyle: CSSProperties = {
  position: "relative",
  zIndex: 4,
  alignSelf: "center",
  marginTop: 4,
  marginBottom: -4,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.18em",
  color: "#F5C842",
  background: "rgba(245,200,66,.1)",
  border: "1px solid rgba(245,200,66,.3)",
  padding: "3px 10px",
  borderRadius: 999,
};

const mainStyle: CSSProperties = {
  flex: 1,
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px 18px 24px",
};

const stepSectionStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  animation: "onb-step-in .35s cubic-bezier(.2,.8,.2,1)",
};

const h1Style: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: "-1px",
  lineHeight: 1.1,
  marginBottom: 14,
};
const h2Style: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.8px",
  lineHeight: 1.15,
  marginBottom: 10,
  color: "white",
};
const emStyle: CSSProperties = {
  color: COLORS.accent,
  fontStyle: "italic",
};
const introStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: "italic",
  fontSize: 16,
  lineHeight: 1.55,
  color: "rgba(255,255,255,.78)",
  maxWidth: 460,
  marginBottom: 18,
};
const subIntroStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: "italic",
  fontSize: 13,
  color: "rgba(255,255,255,.55)",
  marginBottom: 22,
  maxWidth: 460,
  lineHeight: 1.5,
};
const noteStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.45)",
  marginTop: 16,
};
const changeLaterNoteStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: "italic",
  fontSize: 12,
  color: "rgba(255,255,255,.5)",
  marginTop: 18,
  textAlign: "center",
};

const formStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  textAlign: "left",
  marginTop: 4,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,.85)",
  marginBottom: 6,
};
const hintInlineStyle: CSSProperties = {
  fontWeight: 400,
  color: "rgba(255,255,255,.45)",
};
const hintBelowStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.45)",
  marginTop: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: COLORS.fieldBg,
  border: `1px solid ${COLORS.fieldBorder}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16, // 16px avoids iOS auto-zoom on focus
  color: "white",
  fontFamily: "inherit",
  outline: "none",
};
const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.45,
  minHeight: 80,
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

// ── Campus cards ──────────────────────────────────────────────────────────
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
const fieldErrorStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.red,
  marginTop: 8,
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

const expRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 14,
  background: "rgba(255,255,255,.03)",
  border: `1px solid ${COLORS.fieldBorder}`,
  borderRadius: 14,
};

const uploadBtnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  background: COLORS.accent,
  color: "white",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 16,
  border: "none",
  borderRadius: 12,
  padding: "14px 18px",
  textAlign: "center",
};
const uploadStatusStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.6)",
  marginTop: -8,
  textAlign: "center",
};

const previewWrapStyle: CSSProperties = {
  marginTop: 4,
  border: `1px solid ${COLORS.fieldBorder}`,
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(0,0,0,.25)",
};
const previewLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,.55)",
  padding: "8px 12px",
  fontWeight: 600,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  background: "rgba(255,255,255,.04)",
};
const previewFrameStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: 360,
  border: 0,
  background: "#0b0b0d",
};
const previewImgStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxHeight: 360,
  objectFit: "contain",
  background: "#0b0b0d",
};

const bottomBarStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 6,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding:
    "12px 18px calc(12px + env(safe-area-inset-bottom, 0px))",
  background:
    "linear-gradient(to top, rgba(28,28,30,.95) 60%, rgba(28,28,30,.0))",
  backdropFilter: "blur(10px)",
};

const primaryCtaStyle: CSSProperties = {
  display: "block",
  width: "100%",
  background: COLORS.accent,
  color: "white",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 16,
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  textAlign: "center",
  boxShadow: "0 6px 20px rgba(255,92,53,.35)",
};
const secondaryLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  background: "transparent",
  color: "rgba(255,255,255,.55)",
  fontFamily: "inherit",
  fontWeight: 500,
  fontSize: 14,
  border: "none",
  padding: "6px 18px 4px",
  textAlign: "center",
};

const skipOverlayStyle: CSSProperties = {
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
const skipCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 360,
  background: COLORS.charcoalSoft,
  border: `1px solid ${COLORS.faintBorder}`,
  borderRadius: 20,
  padding: 22,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const skipTitleStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 20,
  fontWeight: 900,
  color: "white",
};
const skipBodyStyle: CSSProperties = {
  fontSize: 14,
  color: "rgba(255,255,255,.7)",
  lineHeight: 1.5,
};
const skipRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 4,
};

const warpOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background:
    "radial-gradient(circle at 50% 50%, rgba(255,92,53,.0) 0%, rgba(255,92,53,.18) 40%, rgba(28,28,30,.95) 75%)",
  animation: "onb-warp .7s ease-out forwards",
  pointerEvents: "none",
};
