import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { normalizeCoverThemeInput } from "@/lib/profile/cover-themes";
import { sanitizeCurrentOn } from "@/lib/profile/current-on";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import {
  PUBLIC_PROFILE_CAMPUS_COLUMNS,
  campusReadUnavailable,
  campusWriteFailed,
  decideProfileCampusWrite,
  readCampusIntent,
  readCampusWriteRow,
  type CampusWriteDecision,
} from "@/lib/profile/profile-campus-write";
import { parseLookingForBody } from "@/lib/profile/looking-for";
import { normalizeResumeRef, resumeKeyOwnerId } from "@/lib/profile/resume-doc-url";
import { sanitizeResumeDocs } from "@/lib/profile/resume-docs";
import { sanitizeResumeRedactions } from "@/lib/profile/resume-redactions";
import {
  deleteResumeObjects,
  purgeRedactedDerivatives,
  resolveResumeUrlInput,
  resumeKeysReferenced,
} from "@/lib/profile/resume-storage";
import { unexpectedSelfWriteKeys } from "@/lib/profile/self-write-columns";
import { inlineOrUploadProfileUrl } from "@/lib/profile/storage-upload";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The profile echoed back to the client, without the campus columns. */
const SYNC_PROFILE_SELECT =
  "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,current_on,resume_redactions";

type ProfileRowRead = {
  data: Record<string, unknown> | null;
  error: { code?: string | null; message?: string | null } | null;
};

/**
 * Full profile sync from `public/html/profile.html` (authenticated, same-origin).
 * Accepts vibe-shaped fields; uploads `data:` images to Supabase Storage.
 *
 * Every column is validated here and written with the SERVICE role, scoped to
 * the caller's own id, in one statement guarded by the closed column list in
 * `self-write-columns.ts` (migration 20260922130000 takes skills, interests,
 * work_experience and looking_for off the `authenticated` UPDATE grant). The
 * cookie client is used for `getUser` only.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Every request. Desktop autosave debounces 1.2 s and mobile posts on Save
  // only, so 300 per 10 minutes is far above real use. The upload limiter
  // below still applies on top.
  const rl = await rateLimit(`profile-sync:${user.id}`, { limit: 300, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Only inline `data:` payloads hit Storage (avatar / banner → `profiles`,
  // resume → `resumes`), so only those are throttled — plain text edits
  // must never be blocked by the upload budget.
  const hasInlineUpload = [body.avatar_url, body.banner_url, body.resume_url].some(
    (v) => typeof v === "string" && /^data:/i.test(v.trim()),
  );
  if (hasInlineUpload) {
    const uploadRl = await rateLimit(`upload:profile-sync:${user.id}`, {
      limit: 20,
      windowSec: 600,
    });
    if (!uploadRl.allowed) return tooManyRequests(uploadRl);
  }

  const patch: Record<string, unknown> = {};
  // avatar_url / banner_url are no longer UPDATE-granted to `authenticated`
  // (migration 20260912102000), so they are collected separately here and
  // written with the service role alongside banner_gradient further down.
  const mediaPatch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const t = body.name.trim().slice(0, 120);
    if (t) patch.name = t;
  }

  for (const [key, max] of [
    ["tagline", 500],
    ["website", 2048],
    ["headline", 500],
    ["location_text", 300],
    ["bio", 4000],
  ] as const) {
    if (typeof body[key] === "string") {
      patch[key] = body[key].trim().slice(0, max);
    }
  }

  if (typeof body.major === "string") {
    patch.major = body.major.trim().slice(0, 200);
  }

  // Self-declared campus — the same two shapes, and the same rules, as
  // PATCH /api/me/profile (see the long comment there and critic A4).
  // profile.html and ProfileMobile send the legacy `school` label on EVERY
  // save, so re-sending the current campus (or "") must change nothing: it
  // must never re-arm the 30-day clock, never confirm a backfilled campus,
  // and never fail the save. The write goes through the service role below.
  const campusTouched = readCampusIntent(body).kind !== "absent";
  let campusDecision: CampusWriteDecision = { kind: "absent" };
  if (campusTouched) {
    const read = await readCampusWriteRow(createSupabaseServiceClient(), user.id);
    campusDecision = read.ok
      ? decideProfileCampusWrite({
          body,
          row: read.row,
          onboarded: isOttoOnboardingComplete(read.row.otto_answers),
        })
      : campusReadUnavailable();
  }

  if ("year" in body) {
    const y = body.year;
    if (y === null) {
      patch.year = null;
    } else if (typeof y === "number" && Number.isInteger(y) && y >= 1 && y <= 12) {
      patch.year = y;
    } else {
      return NextResponse.json(
        { ok: false, error: "year must be null or integer 1-12" },
        { status: 400 },
      );
    }
  }

  // headline is a derived field — buildVibeUserV1FromProfile prefers a
  // stored headline over the derived "<major> · Year <n>" string. So
  // when major or year change, clear the stored headline (unless the
  // request explicitly sent a new one) so the next bootstrap rebuilds
  // it from the fresh major + year.
  if (
    (patch.major !== undefined || patch.year !== undefined) &&
    patch.headline === undefined
  ) {
    patch.headline = "";
  }

  if ("interests" in body) {
    if (!Array.isArray(body.interests)) {
      return NextResponse.json({ ok: false, error: "Invalid interests" }, { status: 400 });
    }
    const interests: string[] = [];
    for (const x of body.interests) {
      if (typeof x !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid interests" }, { status: 400 });
      }
      const t = x.trim().slice(0, 80);
      if (t) interests.push(t);
      if (interests.length >= 40) break;
    }
    patch.interests = interests;
  }

  if ("skills" in body) {
    if (!Array.isArray(body.skills)) {
      return NextResponse.json({ ok: false, error: "Invalid skills" }, { status: 400 });
    }
    const skills: string[] = [];
    for (const x of body.skills) {
      if (typeof x !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid skills" }, { status: 400 });
      }
      const t = x.trim().slice(0, 80);
      if (t) skills.push(t);
      if (skills.length >= 60) break;
    }
    patch.skills = skills;
  }

  // "What are you here for?" tokens. Absent key = column untouched: the
  // desktop sends it only after a chip click, so a cached profile that
  // predates the field can never wipe the stored answer. `null` clears it.
  if ("looking_for" in body) {
    const lookingFor = parseLookingForBody(body.looking_for);
    if (lookingFor === null) {
      return NextResponse.json({ ok: false, error: "Invalid looking_for" }, { status: 400 });
    }
    if (lookingFor !== undefined) patch.looking_for = lookingFor;
  }

  if ("work_experience" in body) {
    patch.work_experience = sanitizeWorkExperience(body.work_experience);
  }

  // Manual-order override flag. Accepted under either snake_case (the
  // server-side column) or camelCase (the localStorage key on
  // profile.html). Stored as a plain boolean column on `users`.
  if ("work_order_manual" in body || "_workOrderManual" in body) {
    const raw =
      "work_order_manual" in body
        ? body.work_order_manual
        : (body as Record<string, unknown>)._workOrderManual;
    patch.work_order_manual = raw === true;
  }

  // "Working on" / "Currently into" items — accepted under either the
  // server-side snake_case key OR the profile.html camelCase key
  // (currentlyOn) so the existing payload builder doesn't have to know
  // about the rename. Sanitizer caps length + item count so the column
  // can't grow unbounded.
  if ("current_on" in body || "currentlyOn" in body) {
    const raw = "current_on" in body ? body.current_on : body.currentlyOn;
    patch.current_on = sanitizeCurrentOn(raw);
  }

  // Resume / portfolio redaction bars — same dual-key acceptance.
  // Sanitizer enforces percentage ranges + caps bar count.
  if ("resume_redactions" in body || "resumeRedactions" in body) {
    const raw =
      "resume_redactions" in body
        ? body.resume_redactions
        : body.resumeRedactions;
    patch.resume_redactions = sanitizeResumeRedactions(raw);
  }

  // The professional snapshot card is gone. Desktop bundles cached before
  // that still send its field on every save, so the field is ignored: never
  // written and never a 400.

  // An uploaded `data:` payload comes back as a public URL on our own
  // Supabase host; a plain http(s) string is passed straight through by
  // inlineOrUploadProfileUrl, which accepts ANY host. That value is rendered
  // into a CSS `url()` on other students' screens, so it is pinned to our
  // host here — the same pin org assets already use. `null` still clears.
  const avatar = await inlineOrUploadProfileUrl(user.id, body.avatar_url, "avatar");
  if (avatar !== undefined) {
    if (typeof avatar === "string" && !isSupabaseHttpsUrl(avatar)) {
      return NextResponse.json({ ok: false, error: "Invalid avatar_url" }, { status: 400 });
    }
    mediaPatch.avatar_url = avatar;
  }

  // Resume objects live in the PRIVATE `resumes` bucket and are stored as
  // `/api/resume/<key>` proxy paths. Snapshot the current refs BEFORE the
  // update so we can delete objects this request un-references: repeated
  // uploads left 37 orphaned, un-redacted PDFs in prod in one month.
  const touchesResume = "resume_url" in body || "resume_docs" in body;
  // Redaction bars change which DERIVATIVE viewers must be served, so the
  // pre-read also snapshots them (see the derivative purge below).
  const touchesRedactions = "resume_redactions" in patch;
  type ResumeRefs = { resume_url: unknown; resume_docs: unknown; resume_redactions: unknown };
  let resumeBefore: ResumeRefs | null = null;
  if (touchesResume || touchesRedactions) {
    try {
      const { data, error } = await createSupabaseServiceClient()
        .from("users")
        .select("resume_url, resume_docs, resume_redactions")
        .eq("id", user.id)
        .maybeSingle();
      if (error) console.error("[profile-sync] resume pre-read", error.message);
      else resumeBefore = (data as ResumeRefs | null) ?? null;
    } catch (e) {
      console.error("[profile-sync] resume pre-read threw", e);
    }
  }

  // data: URL → uploaded to `resumes`; proxy / legacy / external refs are
  // re-validated against user.id (own-bucket keys must carry our prefix).
  const resume = await resolveResumeUrlInput(user.id, body.resume_url);
  if (resume !== undefined) patch.resume_url = resume;

  // Multi-doc resume array — preferred over the single resume_url.
  // Pure data field; uploads already happened client-side via
  // /api/me/profile-upload, so this only persists refs.
  if ("resume_docs" in body) {
    patch.resume_docs = sanitizeResumeDocs(body.resume_docs, user.id);
  }

  // Cover: an uploaded photo wins; otherwise a cover-theme preset KEY.
  // users.banner_gradient holds a key, never CSS (migration 20260912100000
  // CHECKs the key and takes the column off the authenticated UPDATE grant),
  // so it is written with the service role further down and a raw CSS value
  // from an older client is accepted only when it is exactly one of the
  // presets.
  let coverThemePatch: string | undefined;
  if ("banner_url" in body || "banner_gradient" in body) {
    const bu = body.banner_url;
    const bgKey =
      typeof body.banner_gradient === "string"
        ? normalizeCoverThemeInput(body.banner_gradient)
        : "";

    if (typeof bu === "string" && bu.trim()) {
      const resolved = await inlineOrUploadProfileUrl(user.id, bu, "banner");
      // Same host pin as the avatar above: an uploaded photo resolves to our
      // own Supabase host, and an arbitrary http(s) link must not become a
      // CSS `url()` fetch on every viewer's screen.
      if (resolved === undefined || resolved === null || !isSupabaseHttpsUrl(resolved)) {
        return NextResponse.json({ ok: false, error: "Invalid banner" }, { status: 400 });
      }
      mediaPatch.banner_url = resolved;
      coverThemePatch = "";
    } else if (bgKey === null) {
      return NextResponse.json(
        { ok: false, error: "Invalid banner_gradient" },
        { status: 400 },
      );
    } else if (bgKey !== "") {
      mediaPatch.banner_url = null;
      coverThemePatch = bgKey;
    } else if (bu === null && "banner_url" in body) {
      mediaPatch.banner_url = null;
      coverThemePatch = "";
    }
  }

  if (
    Object.keys(patch).length === 0 &&
    Object.keys(mediaPatch).length === 0 &&
    coverThemePatch === undefined &&
    !campusTouched
  ) {
    return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  // ONE service-role statement for every profile column, scoped to the
  // caller's own id. Several of these columns are no longer UPDATE-granted
  // to `authenticated` (banner_gradient: 20260912100000; avatar_url /
  // banner_url: 20260912102000; skills, interests, work_experience,
  // looking_for: 20260922130000), and one statement means the fields can
  // never half-apply against each other. The service role passes every
  // grant, so the closed list in `self-write-columns.ts` stands in front of
  // it: a key outside the list is a coding slip and fails the save.
  const writePatch: Record<string, unknown> = { ...patch, ...mediaPatch };
  if (coverThemePatch !== undefined) writePatch.banner_gradient = coverThemePatch;

  if (Object.keys(writePatch).length > 0) {
    const bad = unexpectedSelfWriteKeys(writePatch);
    if (bad.length > 0) {
      console.error("[profile-sync POST] unexpected columns", bad);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    const { error: upErr } = await createSupabaseServiceClient()
      .from("users")
      .update(writePatch)
      .eq("id", user.id);
    if (upErr) {
      console.error("[profile-sync POST]", upErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
  }

  // Campus + its stamp + the dual-written legacy label, in one service-role
  // statement (no UPDATE grant on the campus columns).
  if (campusDecision.kind === "write") {
    const { error: campusErr } = await createSupabaseServiceClient()
      .from("users")
      .update(campusDecision.patch)
      .eq("id", user.id);
    if (campusErr) {
      console.error("[profile-sync POST campus]", campusErr);
      campusDecision = campusWriteFailed(campusErr);
    }
  }

  // Same rule as PATCH /api/me/profile: a campus rejection never fails the
  // fields that saved. With other fields written the response stays ok and
  // carries `campusError` — desktop skips the bootstrap adoption on a failed
  // sync, so a non-ok here would leave the stale campus in its payload and
  // fail every later save (critic A4).
  const campusError = campusDecision.kind === "reject" ? campusDecision.rejection : null;
  const wroteOtherFields = Object.keys(writePatch).length > 0;
  if (campusError && !wroteOtherFields) {
    return NextResponse.json(
      {
        ok: false,
        code: campusError.code,
        error: campusError.error,
        ...(campusError.availableAt ? { availableAt: campusError.availableAt } : {}),
      },
      { status: campusError.status },
    );
  }

  // Best-effort orphan cleanup: keys referenced before the update but not
  // after, restricted to objects under this user's own prefix. Failures
  // are logged and never fail the request.
  if (touchesResume && resumeBefore) {
    try {
      const before = resumeKeysReferenced(resumeBefore.resume_url, resumeBefore.resume_docs);
      const after = resumeKeysReferenced(
        "resume_url" in patch ? patch.resume_url : resumeBefore.resume_url,
        "resume_docs" in patch ? patch.resume_docs : resumeBefore.resume_docs,
      );
      const orphans = [...before].filter(
        (k) => !after.has(k) && resumeKeyOwnerId(k) === user.id,
      );
      if (orphans.length > 0) {
        await deleteResumeObjects(orphans);
        console.log(`[profile-sync] removed ${orphans.length} un-referenced resume object(s)`);
      }
    } catch (e) {
      console.error("[profile-sync] resume orphan cleanup", e);
    }
  }

  // Best-effort derivative invalidation: viewers are served burned-in
  // copies under `<uid>/redacted/` keyed by (source key, bars). Whenever
  // the docs, the legacy resume_url or the bars actually change, drop
  // every derivative so the next viewer request regenerates it lazily.
  // If the pre-read failed we cannot compare, so purge conservatively.
  if (touchesResume || touchesRedactions) {
    try {
      let changed = true;
      if (resumeBefore) {
        const canon = (docs: unknown, url: unknown, bars: unknown) =>
          JSON.stringify([
            sanitizeResumeDocs(docs, user.id),
            normalizeResumeRef(url, user.id),
            sanitizeResumeRedactions(bars),
          ]);
        const before = canon(
          resumeBefore.resume_docs,
          resumeBefore.resume_url,
          resumeBefore.resume_redactions,
        );
        const after = canon(
          "resume_docs" in patch ? patch.resume_docs : resumeBefore.resume_docs,
          "resume_url" in patch ? patch.resume_url : resumeBefore.resume_url,
          "resume_redactions" in patch
            ? patch.resume_redactions
            : resumeBefore.resume_redactions,
        );
        changed = before !== after;
      }
      if (changed) {
        const n = await purgeRedactedDerivatives(user.id);
        if (n > 0) console.log(`[profile-sync] purged ${n} redacted derivative(s)`);
      }
    } catch (e) {
      console.error("[profile-sync] redacted derivative purge", e);
    }
  }

  // email / school_email are private columns (no RLS read); self-read via
  // the service role scoped to the caller's id. The campus columns are asked
  // for too, so the echoed `profile` reports the campus this request just
  // wrote instead of a flat null (normalizeProfileView always emits both
  // fields); before migration M1 they don't exist, so a missing-column error
  // — and only that — retries without them.
  const echoService = createSupabaseServiceClient();
  let { data: row, error: selErr } = (await echoService
    .from("users")
    .select(`${SYNC_PROFILE_SELECT},${PUBLIC_PROFILE_CAMPUS_COLUMNS}`)
    .eq("id", user.id)
    .single()) as ProfileRowRead;
  if (selErr && isMissingColumnError(selErr)) {
    ({ data: row, error: selErr } = (await echoService
      .from("users")
      .select(SYNC_PROFILE_SELECT)
      .eq("id", user.id)
      .single()) as ProfileRowRead);
  }

  if (selErr || !row) {
    return NextResponse.json({ ok: true, profile: null, ...(campusError ? { campusError } : {}) });
  }

  return NextResponse.json({
    ok: true,
    profile: normalizeProfileView(row as Record<string, unknown>),
    ...(campusError ? { campusError } : {}),
  });
}
