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

import { IU_MAJORS_BY_SCHOOL } from "@/lib/iu/majors";

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
export function OnboardingMobile({ replay }: { replay: boolean }) {
  const [step, setStep] = useState(1);

  // Step 2 — Profile draft
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<{
    text: string;
    color: string;
  } | null>(null);
  const [bio, setBio] = useState("");
  const [major, setMajor] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);

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

    const ottoConfig = {
      name: "otto",
      platforms: [] as string[],
      voiceSamples: [] as string[],
      leash: "ask",
      setupAt: new Date().toISOString(),
    };

    setWarping(true);

    // Replay mode: skip the server save (returning user re-viewing the flow)
    if (replay) {
      setTimeout(() => {
        window.location.href = "/profile";
      }, 700);
      return;
    }

    let nextHref: string | null = null;
    try {
      const r = await fetch("/api/me/onboarding-complete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otto_answers: ottoConfig,
          profile: Object.keys(profile).length ? profile : undefined,
        }),
      });
      const j = await r.json();

      // Best-effort handle claim (separate route — has own validation).
      const claimed = handle.trim().toLowerCase();
      if (claimed && HANDLE_RE.test(claimed)) {
        try {
          await fetch("/api/me/handle", {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: claimed }),
          });
        } catch {
          /* non-fatal */
        }
      }

      if (j?.ok && typeof j.next === "string" && j.next.startsWith("/")) {
        nextHref = j.next + (j.next.includes("?") ? "&" : "?") + "welcome=1";
      }
    } catch {
      /* network error — fall back below */
    }

    setTimeout(() => {
      window.location.href =
        nextHref ?? `/auth/login?next=${encodeURIComponent("/onboarding")}`;
    }, 700);
  }, [
    submitting,
    name,
    handle,
    bio,
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

              <Field label="Major" hint="start typing — IU Indianapolis list">
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  maxLength={80}
                  list="onbIuMajors"
                  autoComplete="off"
                  placeholder="e.g. Informatics"
                  style={inputStyle}
                />
                <datalist id="onbIuMajors">
                  {ALL_IU_MAJORS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>

              <Field label="Department / school" hint="optional">
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={120}
                  list="onbIuSchools"
                  autoComplete="off"
                  placeholder="e.g. Luddy School of Informatics…"
                  style={inputStyle}
                />
                <datalist id="onbIuSchools">
                  {ALL_IU_SCHOOLS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
              onClick={() => setStep(3)}
            >
              Continue →
            </button>
            <button
              type="button"
              style={secondaryLinkStyle}
              onClick={() => setStep(4)}
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
              {"You can always come back. Your profile won't be saved from this flow until you finish."}
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
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Skip anyway
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
