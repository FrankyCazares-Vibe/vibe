"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { OnbHeader } from "@/components/mobile/onboarding/OnbHeader";
import { SkipSheet } from "@/components/mobile/onboarding/SkipSheet";
import { StepCampus } from "@/components/mobile/onboarding/StepCampus";
import {
  StepClubs,
  initialClubsState,
  type ClubsState,
} from "@/components/mobile/onboarding/StepClubs";
import {
  StepPeople,
  initialPeopleState,
  type PeopleState,
} from "@/components/mobile/onboarding/StepPeople";
import { StepPhoto } from "@/components/mobile/onboarding/StepPhoto";
import {
  HANDLE_RE,
  LOOKING_FOR_OPTIONS,
  StepProfile,
  asOnboardingYear,
  identityProblem,
  profileFieldForCode,
  profileStepBody,
  useHandleCheck,
  type ProfileFields,
} from "@/components/mobile/onboarding/StepProfile";
import { ONB_COPY } from "@/components/mobile/onboarding/onb-copy";
import {
  COLORS,
  primaryCtaStyle,
  secondaryLinkStyle,
  stepSectionStyle,
} from "@/components/mobile/onboarding/onb-theme";
import { isSafeRelativePath } from "@/lib/auth/login-next";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  allowedCampusId,
  campusRowById,
  isCampusAllowed,
  isSchoolSystem,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { majorsForCampus } from "@/lib/iu/majors";
import type { OnboardingBoot } from "@/lib/onboarding/boot";
import {
  ONBOARDING_TOTAL_STEPS,
  clearDraft,
  createDraftSaver,
  flushDraftOnHide,
  loadDraft,
  onboardingResumeStep,
  onboardingStartStep,
  typedDraftFields,
  type DraftSaver,
} from "@/lib/onboarding/draft";
import { anyClubFollowed } from "@/lib/onboarding/social-steps";

/**
 * Mobile-native Otto onboarding, six steps (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12):
 *
 *   1 hello → 2 campus → 3 profile → 4 photo → 5 follow clubs → 6 people
 *
 * Desktop serves the static page at `/onboarding/classic` inside an iframe
 * via `OnboardingSwitch`, and mirrors this flow step for step (B13).
 *
 * SAVES AS YOU GO. Continue on the campus and profile steps writes that step
 * through `POST /api/me/onboarding-step`; the photo saves the moment it is
 * cropped; club and person follows save on tap. Finish (and Skip) only marks
 * onboarding done, after catching up any campus or profile change that
 * didn't go through a Continue (browser Forward, for one). Everything typed
 * is also kept in a localStorage draft (`draft.ts`), so a reload, an app
 * switch or iOS reloading the tab after "Take Photo" comes back to the same
 * step with the same text. Replay (`?replay=1`) reads live data but never
 * loads, saves or clears a draft and never writes anything.
 *
 * THE CAMPUS FOLLOWS THE UNIVERSITY THE SCHOOL EMAIL PROVED (ac014a3): the
 * cards are that system's campuses, shared communities first, and nothing
 * is picked unless the email names one campus or the student already
 * confirmed one (or picked one earlier, from the draft).
 *
 * ONE BACK. The header's Back, the browser's Back and the iOS swipe are the
 * same thing: every step change is a same-URL history entry carrying
 * `onbStep`, and a `popstate` listener shows that step. While something is
 * saving, a Back is undone instead of honoured.
 *
 * The header (Back, logo, "n of 6", Skip) is pinned on every step. The shell
 * is deliberately NOT a scroll container, which is what used to scroll the
 * sticky header away, and nothing is focused on step entry.
 */

const CAMPUS_SAVE_FAILED = "Couldn't save your campus.";
const PROFILE_SAVE_FAILED = "Couldn't save your profile.";

/** Step-route refusals that belong on the campus cards, not in a toast. */
const CAMPUS_FIELD_CODES: ReadonlySet<string> = new Set([
  "campus_invalid",
  "campus_change_too_soon",
  "system_missing",
  "campus_not_ready",
]);

const LOOKING_FOR_VALUES: readonly string[] = LOOKING_FOR_OPTIONS.map((o) => o.value);

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

/** The one place this flow navigates away. */
function leave(dest: string): void {
  window.location.href = dest;
}

/*
 * HISTORY ENTRIES. Every `pushState` / `replaceState` below passes
 * `{ ...window.history.state, onbStep: n }` and "" with NO url. Next's app
 * router reloads the page on a popstate whose state lacks its own `__NA` key;
 * spreading the current state keeps that key and the router tree, so the
 * router only restores the same URL and this component shows the step.
 *
 * ONE ENTRY PER STEP. The onboarding entries are always steps 1, 2, 3, … in
 * order, so an entry's `onbStep` is also its depth: the distance between two
 * steps is their difference. `sendBack` and every undo below rely on that, so
 * nothing may leave two entries for one step. Moves that must not happen are
 * undone with `history.go` back to where the student was, never by rewriting
 * the entry they landed on.
 */

type Prefill = OnboardingMobileProps["prefill"];

/** Profile fields from the server prefill alone: the base layer of the restore. */
function prefillFields(prefill: Prefill): ProfileFields {
  return {
    name: prefill?.name ?? "",
    handle: prefill?.hasRealHandle ? prefill.handle : "",
    bio: prefill?.bio ?? "",
    major: prefill?.major ?? "",
    department: prefill?.department ?? "",
    // The select tops out at "5th+ / grad"; the server accepts 1–12.
    year: prefill?.year ? asOnboardingYear(String(Math.min(5, prefill.year))) : "",
    interests: (prefill?.interests ?? []).join(", "),
    skills: (prefill?.skills ?? []).join(", "),
    looking_for: (prefill?.looking_for ?? []).filter((v) => LOOKING_FOR_VALUES.includes(v)),
  };
}

function sameField(a: ProfileFields[keyof ProfileFields], b: ProfileFields[keyof ProfileFields]): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

type Boot = {
  fields: ProfileFields;
  campusId: string;
  step: number;
  maxStep: number;
  /** The draft restored a profile value the server doesn't have yet. */
  profileDirty: boolean;
};

/**
 * The restore, computed once (§9 B12 item 4). The prefill is the base; the
 * draft overrides typed fields; the server wins for a claimed handle and a
 * confirmed campus. Replay neither loads nor saves a draft.
 */
function computeBoot(p: {
  replay: boolean;
  userId: string | undefined;
  system: SchoolSystem | null;
  prefill: Prefill;
  singleCampusId: string | null | undefined;
}): Boot {
  const { replay, userId, system, prefill, singleCampusId } = p;
  const draft = !replay && userId ? loadDraft(userId) : null;
  const d = typedDraftFields(draft?.fields);
  const base = prefillFields(prefill);

  const fields: ProfileFields = {
    name: d.name ?? base.name,
    handle: prefill?.hasRealHandle ? base.handle : (d.handle ?? ""),
    bio: d.bio ?? base.bio,
    major: d.major ?? base.major,
    department: d.department ?? base.department,
    year: d.year ?? base.year,
    interests: d.interests ?? base.interests,
    skills: d.skills ?? base.skills,
    looking_for: (d.looking_for ?? base.looking_for).filter((v) => LOOKING_FOR_VALUES.includes(v)),
  };

  // Nothing preselects a campus except the student's own earlier pick (from
  // the draft, while none is confirmed), a campus they already confirmed, or
  // the visible single-campus preselect from the email. The confirmed campus
  // outranks the preselect: Finish and Skip save any pick that differs from
  // it, so the email's campus must never replace it unseen.
  let campusId = "";
  const draftPick = prefill?.campusConfirmed ? null : allowedCampusId(d.campus_id, system);
  if (draftPick) campusId = draftPick;
  else if (system) {
    campusId =
      (prefill?.campusConfirmed ? allowedCampusId(prefill.campusId, system) : null) ??
      allowedCampusId(singleCampusId, system) ??
      "";
  }

  const saved = {
    campusId: prefill?.campusId,
    campusConfirmed: prefill?.campusConfirmed,
    hasRealHandle: prefill?.hasRealHandle,
    systemKnown: !!system,
  };
  const step = replay ? 1 : onboardingResumeStep(draft, saved);
  const start = replay ? 1 : onboardingStartStep(draft, saved);
  // Pulled back past an unsaved step: nothing above it is reachable yet.
  const maxStep = step < start ? step : Math.max(step, draft?.maxStep ?? step);

  const keys = Object.keys(fields) as (keyof ProfileFields)[];
  const profileDirty = keys.some((k) => !sameField(fields[k], base[k]));

  return { fields, campusId, step, maxStep, profileDirty };
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
 * the flow still works without it, which is the shape `OnboardingSwitch`
 * already types.
 */
export type OnboardingMobileProps = { replay: boolean } & Partial<
  Omit<OnboardingBoot, "replay">
>;

export function OnboardingMobile({
  replay,
  userId,
  system: systemProp,
  prefill,
  singleCampusId,
}: OnboardingMobileProps) {
  // ── University and restore ───────────────────────────────────────────────
  // The verified university; null when nothing is stamped yet. The Purdue
  // switch on the campus step can change it.
  const [system, setSystem] = useState<SchoolSystem | null>(() =>
    isSchoolSystem(systemProp) ? systemProp : null,
  );
  const [boot] = useState<Boot>(() =>
    computeBoot({
      replay,
      userId,
      system: isSchoolSystem(systemProp) ? systemProp : null,
      prefill,
      singleCampusId,
    }),
  );

  /** The @pfw.edu / @pnw.edu single-campus preselect: visible, still confirmed by the student. */
  const preselectId = isCampusAllowed(singleCampusId, system) ? (singleCampusId ?? null) : null;

  const [step, setStep] = useState(boot.step);
  const [maxStep, setMaxStep] = useState(boot.maxStep);

  // ── Step 2: campus ───────────────────────────────────────────────────────
  const [campusId, setCampusId] = useState(boot.campusId);
  const [campusError, setCampusError] = useState<string | null>(null);
  const campusGroupRef = useRef<HTMLDivElement | null>(null);
  /** The campus the server has CONFIRMED (`campus_set_at` stamped), else null. */
  const [savedCampusId, setSavedCampusId] = useState<string | null>(() =>
    prefill?.campusConfirmed
      ? allowedCampusId(prefill.campusId, isSchoolSystem(systemProp) ? systemProp : null)
      : null,
  );

  // ── Step 3: profile ──────────────────────────────────────────────────────
  const [fields, setFields] = useState<ProfileFields>(boot.fields);
  const [nameError, setNameError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<HTMLInputElement | null>(null);
  const {
    status: handleStatus,
    setStatus: setHandleStatus,
    onHandleInput: checkHandle,
  } = useHandleCheck();
  /** A real name and a claimed handle are on the row. */
  const [identitySaved, setIdentitySaved] = useState(
    () => !!prefill?.hasRealHandle && !!prefill?.name,
  );
  /** Some profile value on screen isn't saved yet. */
  const profileDirty = useRef(boot.profileDirty);

  // ── Step 4: photo ────────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(prefill?.avatarUrl ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** Replay's local crop preview, revoked when replaced and on unmount. */
  const blobUrlRef = useRef<string | null>(null);

  // ── Steps 5–6: cached for the session, reset on a saved-campus or university change ──
  const [clubs, setClubs] = useState<ClubsState>(initialClubsState);
  const [people, setPeople] = useState<PeopleState>(initialPeopleState);

  // ── Busy, finish, skip ───────────────────────────────────────────────────
  const [savingCampus, setSavingCampus] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** The Purdue switch panel has a request out. */
  const [switching, setSwitching] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const busy = savingCampus || savingProfile || uploading || switching || finishing || skipping;

  const [warping, setWarping] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  /** The sheet's variant as it opened; `forceIdentity` overrides it after a refused save. */
  const [skipBase, setSkipBase] = useState<"saved" | "identity">("identity");
  const [forceIdentity, setForceIdentity] = useState(false);
  const skipVariant = forceIdentity ? "identity" : skipBase;

  // Mirrors for the history listener, which outlives any one render.
  const busyRef = useRef(busy);
  const stepRef = useRef(boot.step);
  const maxStepRef = useRef(boot.maxStep);
  useEffect(() => {
    busyRef.current = busy;
    stepRef.current = step;
    maxStepRef.current = maxStep;
  }, [busy, step, maxStep]);

  /** Set on Finish / Skip success: nothing may write the draft back after it's cleared. */
  const doneRef = useRef(false);
  const saverRef = useRef<DraftSaver | null>(null);

  // ── Draft (never in replay, and only with a user id) ─────────────────────
  useEffect(() => {
    if (replay || !userId) return;
    const saver = createDraftSaver(userId);
    saverRef.current = saver;
    const off = flushDraftOnHide(saver);
    return () => {
      off();
      // After Finish / Skip the clear made this a no-op.
      saver.flush();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [replay, userId]);

  useEffect(() => {
    if (doneRef.current) return;
    // The photo is never in the draft: the server holds it.
    saverRef.current?.schedule({
      step,
      maxStep,
      fields: { campus_id: campusId, ...fields },
    });
  }, [step, maxStep, campusId, fields]);

  // ── Photo preview cleanup ────────────────────────────────────────────────
  useEffect(
    () => () => {
      const url = blobUrlRef.current;
      if (url) URL.revokeObjectURL(url);
    },
    [],
  );

  // ── Shared helpers ───────────────────────────────────────────────────────
  const resetSocial = useCallback(() => {
    setClubs(initialClubsState);
    setPeople(initialPeopleState);
  }, []);

  /** The server confirmed this campus. A new one means new clubs and people. */
  const markCampusSaved = (id: string) => {
    if (id === savedCampusId) return;
    setSavedCampusId(id);
    resetSocial();
  };

  /** Always the next step (`n` is the current step + 1), so each step keeps one entry. */
  const goForward = (n: number) => {
    window.history.pushState({ ...window.history.state, onbStep: n }, "");
    // The listener reads these before the next render's effect would.
    stepRef.current = n;
    maxStepRef.current = Math.max(maxStepRef.current, n);
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
    window.scrollTo({ top: 0 });
  };

  /**
   * Back to an earlier step from Finish, through history so the stack stays
   * true: one entry per step, so the distance is the step difference. Busy is
   * cleared FIRST, or the popstate listener would undo the move.
   */
  const sendBack = (target: number) => {
    busyRef.current = false;
    const delta = target - stepRef.current;
    if (delta < 0) window.history.go(delta);
  };

  const revealCampus = () => {
    campusGroupRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  /** Puts a refusal's line under the name or handle field; returns that field, or null when it isn't a field refusal. */
  const showProfileFieldError = (r: VibeFailure): "name" | "handle" | null => {
    const field = profileFieldForCode(r.code);
    if (field === "name") {
      setNameError(r.error ?? ONB_COPY.profile.errors.nameRequired);
    } else if (field === "handle") {
      setHandleError(r.error ?? ONB_COPY.profile.errors.handleInvalid);
      if (r.code === "handle_taken") {
        setHandleStatus({ kind: "taken", text: ONB_COPY.profile.handleTaken });
      }
    }
    return field;
  };

  /** The step-3 client checks; errors go under the fields. */
  const checkIdentity = (): "name" | "handle" | null => {
    const problem = identityProblem(fields);
    setNameError(problem?.field === "name" ? problem.message : null);
    setHandleError(problem?.field === "handle" ? problem.message : null);
    return problem?.field ?? null;
  };

  const postCampus = (id: string) =>
    vibeRequest("/api/me/onboarding-step", {
      method: "POST",
      json: { step: "campus", campus_id: id },
      quiet: true,
      failure: CAMPUS_SAVE_FAILED,
    });

  const postProfile = () =>
    vibeRequest("/api/me/onboarding-step", {
      method: "POST",
      json: { step: "profile", ...profileStepBody(fields) },
      quiet: true,
      failure: PROFILE_SAVE_FAILED,
    });

  /** A profile refusal that isn't about one field. */
  const toastProfileFailure = (r: VibeFailure) => {
    if (r.code === "profile_invalid") {
      toast({ message: r.error ?? r.message, tone: "error" });
    } else {
      toast({ message: r.message, tone: "error", action: r.action });
    }
  };

  // ── Field handlers ───────────────────────────────────────────────────────
  const onField = <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => {
    setFields((f) => ({ ...f, [k]: v }));
    profileDirty.current = true;
    if (k === "name") setNameError(null);
  };

  const onHandleInput = (raw: string) => {
    const v = checkHandle(raw);
    setFields((f) => ({ ...f, handle: v }));
    profileDirty.current = true;
    setHandleError(null);
  };

  const onPickCampus = (id: string) => {
    setCampusId(id);
    setCampusError(null);
  };

  const onSwitchBusy = (b: boolean) => {
    busyRef.current = b;
    setSwitching(b);
  };

  /** The Purdue switch verified a new university (§9 B12 item 8). */
  const onSystemChanged = (next: { system: SchoolSystem; currentCampusId: string | null }) => {
    setSystem(next.system);
    setCampusId((c) => (isCampusAllowed(c, next.system) ? c : ""));
    // A kept shared campus isn't confirmed by the switch (it keeps the campus
    // without stamping it), so it stays saved only when the server still has
    // exactly this campus and it's allowed in the new university.
    setSavedCampusId((s) =>
      s !== null && isCampusAllowed(s, next.system) && s === next.currentCampusId ? s : null,
    );
    setCampusError(null);
    resetSocial();
  };

  const onUploading = (b: boolean) => {
    busyRef.current = b;
    setUploading(b);
  };

  const onPhotoSaved = (url: string) => {
    const prev = blobUrlRef.current;
    if (prev && prev !== url) URL.revokeObjectURL(prev);
    blobUrlRef.current = url.startsWith("blob:") ? url : null;
    setAvatarUrl(url);
    setPhotoError(null);
  };

  const openPhotoPicker = () => {
    fileInputRef.current?.click();
  };

  // ── Step 2 Continue ──────────────────────────────────────────────────────
  const continueCampus = async () => {
    if (busyRef.current) return;
    // No university on record: there's nothing to pick yet.
    if (system === null) {
      goForward(3);
      return;
    }
    if (!campusId || !isCampusAllowed(campusId, system)) {
      setCampusError(campusId ? ONB_COPY.campus.invalid : ONB_COPY.campus.required);
      revealCampus();
      return;
    }
    // Nothing to save: replay writes nothing, and an unchanged pick would only
    // spend the step route's limiter (shared with profile saves).
    if (replay || campusId === savedCampusId) {
      goForward(3);
      return;
    }
    const picked = campusId;
    busyRef.current = true;
    setSavingCampus(true);
    const r = await postCampus(picked);
    busyRef.current = false;
    setSavingCampus(false);
    if (r.ok) {
      markCampusSaved(picked);
      goForward(3);
      return;
    }
    if (CAMPUS_FIELD_CODES.has(r.code ?? "")) {
      setCampusError(r.error ?? ONB_COPY.campus.invalid);
      revealCampus();
      return;
    }
    toast({ message: r.message, tone: "error", action: r.action });
  };

  // ── Step 3 Continue ──────────────────────────────────────────────────────
  const continueProfile = async () => {
    if (busyRef.current) return;
    const bad = checkIdentity();
    if (bad) {
      // Focusing answers the tap; it isn't focus on step entry.
      (bad === "name" ? nameRef : handleRef).current?.focus();
      return;
    }
    if (replay) {
      goForward(4);
      return;
    }
    busyRef.current = true;
    setSavingProfile(true);
    const r = await postProfile();
    busyRef.current = false;
    setSavingProfile(false);
    if (r.ok) {
      setIdentitySaved(true);
      profileDirty.current = false;
      goForward(4);
      return;
    }
    const field = showProfileFieldError(r);
    if (field) {
      (field === "name" ? nameRef : handleRef).current?.focus();
      return;
    }
    toastProfileFailure(r);
  };

  // ── Finish and Skip ──────────────────────────────────────────────────────
  /** Onboarding is done: drop the draft, queue the campus tour, land where the server says. */
  const succeed = (next: unknown) => {
    doneRef.current = true;
    saverRef.current?.cancel();
    clearDraft(userId);
    try {
      window.localStorage.setItem("vibe_tour_pending", "campus");
    } catch {
      /* storage blocked: the campus page still starts the tour from its URL */
    }
    // Used verbatim: the server's path already carries the welcome flag.
    const dest = typeof next === "string" && isSafeRelativePath(next) ? next : "/campus?welcome=1";
    setWarping(true);
    window.setTimeout(() => leave(dest), 700);
  };

  const finish = async () => {
    if (busyRef.current) return;
    if (replay) {
      setWarping(true);
      window.setTimeout(() => leave("/campus"), 700);
      return;
    }
    busyRef.current = true;
    setFinishing(true);
    const stop = () => {
      busyRef.current = false;
      setFinishing(false);
    };

    // Catch up a campus pick that never went through Continue (browser
    // Forward, for one), so Finish can't succeed on the old campus.
    if (system !== null && campusId !== savedCampusId) {
      if (!campusId || !isCampusAllowed(campusId, system)) {
        stop();
        setCampusError(campusId ? ONB_COPY.campus.invalid : ONB_COPY.campus.required);
        sendBack(2);
        return;
      }
      const picked = campusId;
      const rc = await postCampus(picked);
      if (!rc.ok) {
        stop();
        if (CAMPUS_FIELD_CODES.has(rc.code ?? "")) {
          setCampusError(rc.error ?? ONB_COPY.campus.invalid);
          sendBack(2);
        } else {
          toast({ message: rc.message, tone: "error", action: rc.action });
        }
        return;
      }
      markCampusSaved(picked);
    }

    // The same for profile edits that were never saved.
    if (profileDirty.current || !identitySaved) {
      if (checkIdentity()) {
        stop();
        sendBack(3);
        return;
      }
      const rp = await postProfile();
      if (!rp.ok) {
        stop();
        if (showProfileFieldError(rp)) sendBack(3);
        else toastProfileFailure(rp);
        return;
      }
      setIdentitySaved(true);
      profileDirty.current = false;
    }

    // No university on record means no campus can ever be allowed, so that
    // student finishes the way Skip does (the campus rule is waived) instead
    // of meeting a Finish that can never work. Settings asks again later.
    const r = await vibeRequest<{ next?: unknown }>("/api/me/onboarding-complete", {
      method: "POST",
      json: {
        v: 2,
        otto_answers: buildOttoConfig(),
        ...(system === null ? { skip: true } : {}),
      },
      quiet: true,
      failure: ONB_COPY.people.finishFailed,
    });
    if (r.ok) {
      succeed(r.data.next);
      return;
    }
    stop();
    if (r.code === "name_required") {
      setNameError(r.error ?? ONB_COPY.profile.errors.nameRequired);
      sendBack(3);
      return;
    }
    if (r.code === "handle_required") {
      setHandleError(r.error ?? ONB_COPY.profile.errors.handleRequired);
      sendBack(3);
      return;
    }
    if (r.code === "campus_required" || r.code === "campus_invalid") {
      if (system !== null) {
        setCampusError(r.error ?? ONB_COPY.campus.required);
        sendBack(2);
      } else {
        toast({ message: r.error ?? r.message, tone: "error" });
      }
      return;
    }
    // terms_required keeps Review Terms; a 429 shows the mapped line.
    toast({ message: r.message, tone: "error", action: r.action });
  };

  const openSkip = () => {
    if (busyRef.current) return;
    // In replay nothing is saved, so what's typed decides the variant.
    const hasIdentity = replay
      ? !!fields.name.trim() && HANDLE_RE.test(fields.handle)
      : identitySaved;
    setSkipBase(hasIdentity ? "saved" : "identity");
    setForceIdentity(false);
    setSkipOpen(true);
  };

  const closeSkip = useCallback(() => {
    setSkipOpen(false);
    setForceIdentity(false);
  }, []);

  /** Skip anyway / Save & skip (§9 B12 item 13). */
  const runSkip = async () => {
    if (busyRef.current) return;
    const variant = skipVariant;
    if (replay) {
      if (variant === "identity" && checkIdentity()) return;
      leave("/campus");
      return;
    }
    busyRef.current = true;
    setSkipping(true);
    const stop = () => {
      busyRef.current = false;
      setSkipping(false);
    };

    // A campus is optional on skip, so a refused save is ignored. Only a pick
    // the student could have seen is sent: never the preselect from step 1.
    if (maxStep >= 2 && isCampusAllowed(campusId, system) && campusId !== savedCampusId) {
      const picked = campusId;
      const rc = await postCampus(picked);
      if (rc.ok) markCampusSaved(picked);
    }

    if (variant === "identity" || profileDirty.current) {
      if (checkIdentity()) {
        setForceIdentity(true);
        stop();
        return;
      }
      const rp = await postProfile();
      if (!rp.ok) {
        if (showProfileFieldError(rp)) setForceIdentity(true);
        else toastProfileFailure(rp);
        stop();
        return;
      }
      setIdentitySaved(true);
      profileDirty.current = false;
    }

    const r = await vibeRequest<{ next?: unknown }>("/api/me/onboarding-complete", {
      method: "POST",
      json: { v: 2, otto_answers: buildOttoConfig(), skip: true },
      quiet: true,
      failure: ONB_COPY.skip.failed,
    });
    if (r.ok) {
      succeed(r.data.next);
      return;
    }
    stop();
    if (r.code === "name_required") {
      setForceIdentity(true);
      setNameError(r.error ?? ONB_COPY.profile.errors.nameRequired);
      return;
    }
    if (r.code === "handle_required") {
      setForceIdentity(true);
      setHandleError(r.error ?? ONB_COPY.profile.errors.handleRequired);
      return;
    }
    toast({ message: r.message, tone: "error", action: r.action });
  };

  // ── History: header Back = browser Back = iOS swipe ──────────────────────
  /** A Forward undone past unsaved changes: run this step's Continue once the undo lands. */
  const continueOnLandRef = useRef<number | null>(null);

  const onPopState = (e: PopStateEvent) => {
    const raw = (e.state as { onbStep?: unknown } | null)?.onbStep;
    const at = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : null;
    const current = stepRef.current;
    const pending = continueOnLandRef.current;
    continueOnLandRef.current = null;

    // Not an onboarding entry: Back from step 1, on the way out. Nothing to
    // stamp; the page it belongs to isn't this flow's.
    if (at === null) {
      if (!busyRef.current) {
        if (skipOpen) closeSkip();
        setStep(1);
      }
      return;
    }

    // The undo of a Forward past unsaved changes (below) has landed.
    if (pending !== null && at === pending && current === pending) {
      if (!busyRef.current) void (pending === 2 ? continueCampus() : continueProfile());
      return;
    }

    // Any other landing back on this step (an undo below): nothing moved.
    if (at === current) return;

    // Mid-save: undo the move and stay put. A Back re-adds the steps it left,
    // synchronously, so a save that finishes right after still stacks on top.
    // A Forward goes back to where it came from.
    if (busyRef.current) {
      if (at < current) {
        for (let s = at + 1; s <= current; s++) {
          window.history.pushState({ ...window.history.state, onbStep: s }, "");
        }
      } else if (at > current) {
        window.history.go(current - at);
      }
      return;
    }

    // Past every step reached so far: an entry left above a step the restore
    // pulled back to. Go back to where the student is.
    if (at > maxStepRef.current) {
      window.history.go(current - at);
      return;
    }

    // Forward past a campus or profile step with changes that aren't saved:
    // go back to that step, then run its Continue, so nothing is skipped
    // unsaved. Its own push replaces the forward entries.
    if (!replay && at > current) {
      const campusUnsaved = current === 2 && system !== null && campusId !== savedCampusId;
      const profileUnsaved = current === 3 && (profileDirty.current || !identitySaved);
      if (campusUnsaved || profileUnsaved) {
        continueOnLandRef.current = current;
        window.history.go(current - at);
        return;
      }
    }

    if (skipOpen) closeSkip();
    stepRef.current = at;
    setStep(at);
    window.scrollTo({ top: 0 });
  };

  const popRef = useRef<(e: PopStateEvent) => void>(() => {});
  useEffect(() => {
    popRef.current = onPopState;
  });

  /** Once per mount: StrictMode's second effect run must not move history twice. */
  const stackBuiltRef = useRef(false);
  useEffect(() => {
    if (!stackBuiltRef.current) {
      stackBuiltRef.current = true;
      const target = boot.step;
      const raw: unknown = window.history.state?.onbStep;
      const at = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : null;
      if (at === null) {
        // A fresh load: this entry becomes step 1, with one entry per step up
        // to the restored step.
        window.history.replaceState({ ...window.history.state, onbStep: 1 }, "");
        for (let s = 2; s <= target; s++) {
          window.history.pushState({ ...window.history.state, onbStep: s }, "");
        }
      } else if (at > target) {
        // A reload that restores an earlier step than this entry (the restore
        // pulled back): that step's own entry is below this one, so go there.
        // A Forward onto an entry above it that's past maxStep is undone.
        window.history.go(target - at);
      } else {
        // A reload on this step or below it: keep the entries under it.
        for (let s = at + 1; s <= target; s++) {
          window.history.pushState({ ...window.history.state, onbStep: s }, "");
        }
      }
    }
    const listener = (e: PopStateEvent) => popRef.current(e);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, [boot.step]);

  // ── Derived for render ───────────────────────────────────────────────────
  // Majors follow the campus: a curated list where one exists, else free text.
  const majorList = useMemo(
    () => (system && campusId ? majorsForCampus(campusId, system) : null),
    [system, campusId],
  );

  const campusForSteps = savedCampusId ?? (isCampusAllowed(campusId, system) ? campusId : null);
  const campusRow = campusRowById(campusForSteps);
  const campusShortName = campusRow?.shortName ?? null;
  const campusShared = (campusRow?.systems.length ?? 0) > 1;

  const initial = (fields.name.trim().charAt(0) || "?").toUpperCase();

  let body: ReactNode = null;
  if (step === 2) {
    body = (
      <StepCampus
        system={system}
        campusId={campusId}
        preselectId={preselectId}
        error={campusError}
        replay={replay}
        busy={busy}
        groupRef={campusGroupRef}
        onPick={onPickCampus}
        onBusy={onSwitchBusy}
        onSystemChanged={onSystemChanged}
      />
    );
  } else if (step === 3) {
    body = (
      <StepProfile
        fields={fields}
        onField={onField}
        onHandleInput={onHandleInput}
        handleStatus={handleStatus}
        errors={{ name: nameError, handle: handleError }}
        nameRef={nameRef}
        handleRef={handleRef}
        majorList={majorList}
      />
    );
  } else if (step === 4) {
    body = (
      <StepPhoto
        replay={replay}
        avatarUrl={avatarUrl}
        initial={initial}
        fileInputRef={fileInputRef}
        error={photoError}
        onError={setPhotoError}
        onUploading={onUploading}
        onSaved={onPhotoSaved}
      />
    );
  } else if (step === 5) {
    body = (
      <StepClubs
        replay={replay}
        campusShortName={campusShortName}
        state={clubs}
        setState={setClubs}
      />
    );
  } else if (step === 6) {
    body = (
      <StepPeople
        replay={replay}
        campusShortName={campusShortName}
        campusShared={campusShared}
        system={system}
        state={people}
        setState={setPeople}
      />
    );
  }

  let footer: ReactNode = null;
  if (step === 1) {
    footer = (
      <button type="button" style={cta(busy)} disabled={busy} onClick={() => goForward(2)}>
        {ONB_COPY.hello.cta}
      </button>
    );
  } else if (step === 2) {
    footer = (
      <button type="button" style={cta(busy)} disabled={busy} onClick={() => void continueCampus()}>
        {savingCampus ? ONB_COPY.campus.saving : ONB_COPY.campus.continue}
      </button>
    );
  } else if (step === 3) {
    footer = (
      <button type="button" style={cta(busy)} disabled={busy} onClick={() => void continueProfile()}>
        {savingProfile ? ONB_COPY.profile.saving : ONB_COPY.profile.continue}
      </button>
    );
  } else if (step === 4) {
    footer = uploading ? (
      <button type="button" style={cta(true)} disabled>
        {ONB_COPY.photo.uploading}
      </button>
    ) : avatarUrl ? (
      <>
        <button type="button" style={cta(busy)} disabled={busy} onClick={() => goForward(5)}>
          {ONB_COPY.photo.continue}
        </button>
        <button type="button" style={secondaryTapStyle} disabled={busy} onClick={openPhotoPicker}>
          {ONB_COPY.photo.change}
        </button>
      </>
    ) : (
      <>
        <button type="button" style={cta(busy)} disabled={busy} onClick={openPhotoPicker}>
          {ONB_COPY.photo.choose}
        </button>
        <button type="button" style={secondaryTapStyle} disabled={busy} onClick={() => goForward(5)}>
          {ONB_COPY.photo.skip}
        </button>
      </>
    );
  } else if (step === 5) {
    footer = (
      <button type="button" style={cta(busy)} disabled={busy} onClick={() => goForward(6)}>
        {anyClubFollowed(clubs.rows, clubs.local) ? ONB_COPY.clubs.continue : ONB_COPY.clubs.skipForNow}
      </button>
    );
  } else if (step === 6) {
    footer = (
      <button type="button" style={cta(busy)} disabled={busy} onClick={() => void finish()}>
        {finishing ? ONB_COPY.people.finishing : ONB_COPY.people.finish}
      </button>
    );
  }

  return (
    <div style={shellStyle}>
      <StyleTag />

      {/* Soft glow accents, clipped by their own fixed layer (not the shell) */}
      <div style={glowLayerStyle} aria-hidden="true">
        <span style={bg1Style} />
        <span style={bg2Style} />
      </div>

      <OnbHeader
        step={step}
        total={ONBOARDING_TOTAL_STEPS}
        backDisabled={busy}
        skipDisabled={busy || skipOpen}
        onBack={() => window.history.back()}
        onSkip={openSkip}
      />

      {replay && <div style={replayPillStyle}>{ONB_COPY.header.replay}</div>}

      <main style={mainStyle}>
        <section key={step} style={stepSectionStyle}>
          {step === 1 ? (
            <>
              <OttoOrb size="big" />
              <h1 style={h1Style}>
                {"i'm "}<em style={emStyle}>otto</em>.
              </h1>
              <p style={introStyle}>{ONB_COPY.hello.intro}</p>
              <p style={noteStyle}>{ONB_COPY.hello.note}</p>
            </>
          ) : (
            <>
              <OttoOrb size="small" />
              {body}
            </>
          )}
        </section>
      </main>

      {/* Sticky bottom CTA */}
      <footer style={bottomBarStyle}>{footer}</footer>

      <SkipSheet
        open={skipOpen}
        variant={skipVariant}
        busy={busy}
        name={fields.name}
        handle={fields.handle}
        handleStatus={handleStatus}
        nameError={nameError}
        handleError={handleError}
        onName={(v) => onField("name", v)}
        onHandleInput={onHandleInput}
        onKeepGoing={closeSkip}
        onSkipAnyway={() => void runSkip()}
        onSaveAndSkip={() => void runSkip()}
      />

      {/* Warp overlay (simplified mobile version of the desktop hyperdrive) */}
      {warping && <div style={warpOverlayStyle} />}
    </div>
  );
}

/** The primary button, dimmed while it can't be tapped. */
function cta(disabled: boolean): CSSProperties {
  return disabled ? { ...primaryCtaStyle, opacity: 0.6 } : primaryCtaStyle;
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

// Not a scroll container (no overflow clip): that is what lets the header's
// `position: sticky` hold while the page scrolls.
const shellStyle: CSSProperties = {
  position: "relative",
  minHeight: "100dvh",
  background: COLORS.charcoal,
  color: "white",
  fontFamily:
    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
  display: "flex",
  flexDirection: "column",
  paddingBottom: "calc(140px + env(safe-area-inset-bottom, 0px))",
};

const glowLayerStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  zIndex: 0,
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

const h1Style: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: "-1px",
  lineHeight: 1.1,
  marginBottom: 14,
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
const noteStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.45)",
  marginTop: 16,
};

/** The theme's text button, at least 44px tall to tap. */
const secondaryTapStyle: CSSProperties = { ...secondaryLinkStyle, minHeight: 44 };

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

const warpOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background:
    "radial-gradient(circle at 50% 50%, rgba(255,92,53,.0) 0%, rgba(255,92,53,.18) 40%, rgba(28,28,30,.95) 75%)",
  animation: "onb-warp .7s ease-out forwards",
  pointerEvents: "none",
};
