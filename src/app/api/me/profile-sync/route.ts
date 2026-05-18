import { NextResponse } from "next/server";

import { sanitizeCurrentOn } from "@/lib/profile/current-on";
import { normalizeProfileView } from "@/lib/profile/normalize-profile-view";
import { sanitizeRecruiterSnapshot } from "@/lib/profile/recruiter-snapshot";
import { sanitizeResumeDocs } from "@/lib/profile/resume-docs";
import { sanitizeResumeRedactions } from "@/lib/profile/resume-redactions";
import { inlineOrUploadProfileUrl } from "@/lib/profile/storage-upload";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Full profile sync from `public/html/profile.html` (authenticated, same-origin).
 * Accepts vibe-shaped fields; uploads `data:` images to Supabase Storage.
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

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

  if ("recruiter_snapshot" in body) {
    const snap = sanitizeRecruiterSnapshot(body.recruiter_snapshot);
    if (snap === undefined) {
      return NextResponse.json(
        { ok: false, error: "Invalid recruiter_snapshot" },
        { status: 400 },
      );
    }
    patch.recruiter_snapshot = snap;
  }

  const avatar = await inlineOrUploadProfileUrl(supabase, user.id, body.avatar_url, "avatar");
  if (avatar !== undefined) patch.avatar_url = avatar;

  const resume = await inlineOrUploadProfileUrl(supabase, user.id, body.resume_url, "resume");
  if (resume !== undefined) patch.resume_url = resume;

  // Multi-doc resume array — preferred over the single resume_url.
  // Pure data field; uploads already happened client-side via
  // /api/me/profile-upload, so this only persists URLs.
  if ("resume_docs" in body) {
    patch.resume_docs = sanitizeResumeDocs(body.resume_docs);
  }

  if ("banner_url" in body || "banner_gradient" in body) {
    const bu = body.banner_url;
    const bgStr =
      typeof body.banner_gradient === "string"
        ? body.banner_gradient.trim().slice(0, 4000)
        : "";

    if (typeof bu === "string" && bu.trim()) {
      const resolved = await inlineOrUploadProfileUrl(supabase, user.id, bu, "banner");
      if (resolved === undefined || resolved === null) {
        return NextResponse.json({ ok: false, error: "Invalid banner" }, { status: 400 });
      }
      patch.banner_url = resolved;
      patch.banner_gradient = "";
    } else if (bgStr.startsWith("linear-gradient") || bgStr.startsWith("radial-gradient")) {
      patch.banner_url = null;
      patch.banner_gradient = bgStr;
    } else if (bu === null && "banner_url" in body) {
      patch.banner_url = null;
      patch.banner_gradient = "";
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  const { error: upErr } = await supabase.from("users").update(patch).eq("id", user.id);

  if (upErr) {
    console.error("[profile-sync POST]", upErr);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  const { data: row, error: selErr } = await supabase
    .from("users")
    .select(
      "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,resume_docs,interests,skills,looking_for,work_experience,work_order_manual,recruiter_snapshot,current_on,resume_redactions",
    )
    .eq("id", user.id)
    .single();

  if (selErr || !row) {
    return NextResponse.json({ ok: true, profile: null });
  }

  return NextResponse.json({
    ok: true,
    profile: normalizeProfileView(row as Record<string, unknown>),
  });
}
