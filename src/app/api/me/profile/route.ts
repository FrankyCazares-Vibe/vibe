import { NextResponse } from "next/server";

import { sanitizeRecruiterSnapshot } from "@/lib/profile/recruiter-snapshot";
import { changeHandleForUser } from "@/lib/profile/handle-change";
import { normalizeResumeRef } from "@/lib/profile/resume-doc-url";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const LOOKING_FOR_OPTIONS = [
  "meeting-people",
  "showing-work",
  "finding-clubs",
  "exploring",
] as const;

type LookingFor = (typeof LOOKING_FOR_OPTIONS)[number];

function isLookingForToken(s: string): s is LookingFor {
  return (LOOKING_FOR_OPTIONS as readonly string[]).includes(s);
}

function trimStr(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  return s.trim().slice(0, max);
}

function parseUrlField(val: unknown): string | null {
  if (val === null) return null;
  if (typeof val !== "string") {
    throw new Error("invalid");
  }
  const t = val.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("invalid");
    }
    return t.slice(0, 2048);
  } catch {
    throw new Error("invalid");
  }
}

function stringArray(val: unknown, maxItems: number, maxEach: number): string[] | undefined {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) return undefined;
  const out: string[] = [];
  for (const item of val) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, maxEach);
    if (t) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function lookingForArray(val: unknown): string[] | undefined {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) return undefined;
  const out = new Set<string>();
  for (const item of val) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (isLookingForToken(t)) out.add(t);
  }
  return [...out];
}

/**
 * Update the signed-in user's `public.users` row. Only whitelisted columns; RLS enforces self-only.
 */
export async function PATCH(req: Request) {
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
  let handleTouched = false;

  const name = trimStr(body.name, 120);
  if (name !== null) patch.name = name;

  // Handle changes share the same validator + 14-day cooldown as
  // /api/me/handle (changeHandleForUser). `users.handle` is not
  // self-updatable via RLS, so this branch writes through the service role.
  if ("handle" in body && body.handle !== undefined && body.handle !== null) {
    handleTouched = true;
    const result = await changeHandleForUser(user.id, body.handle);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.status === 409 ? "That @handle is already taken. Try another." : result.error,
          ...(result.cooldown_days_left !== undefined
            ? { cooldown_days_left: result.cooldown_days_left }
            : {}),
        },
        { status: result.status },
      );
    }
  }

  const bio = trimStr(body.bio, 4000);
  if (bio !== null) patch.bio = bio;

  const tagline = trimStr(body.tagline, 500);
  if (tagline !== null) patch.tagline = tagline;

  if ("website" in body) {
    if (body.website === "" || body.website === null) {
      patch.website = "";
    } else {
      try {
        patch.website = parseUrlField(body.website) ?? "";
      } catch {
        return NextResponse.json({ ok: false, error: "Invalid website" }, { status: 400 });
      }
    }
  }

  const headline = trimStr(body.headline, 500);
  if (headline !== null) patch.headline = headline;

  const location_text = trimStr(body.location_text, 300);
  if (location_text !== null) patch.location_text = location_text;

  if (typeof body.banner_gradient === "string") {
    const g = body.banner_gradient.trim().slice(0, 4000);
    if (
      g.startsWith("linear-gradient") ||
      g.startsWith("radial-gradient") ||
      g === ""
    ) {
      patch.banner_gradient = g;
    } else {
      return NextResponse.json({ ok: false, error: "Invalid banner_gradient" }, { status: 400 });
    }
  }

  const major = trimStr(body.major, 200);
  if (major !== null) patch.major = major;

  const department = trimStr(body.department, 200);
  if (department !== null) patch.department = department;

  if ("year" in body) {
    const y = body.year;
    if (y === null) {
      patch.year = null;
    } else if (typeof y === "number" && Number.isInteger(y) && y >= 1 && y <= 12) {
      patch.year = y;
    } else {
      return NextResponse.json(
        { ok: false, error: "year must be null or integer 1–12" },
        { status: 400 },
      );
    }
  }

  const interests = stringArray(body.interests, 40, 80);
  if (interests !== undefined) patch.interests = interests;

  const skills = stringArray(body.skills, 60, 80);
  if (skills !== undefined) patch.skills = skills;

  const looking_for = lookingForArray(body.looking_for);
  if (looking_for !== undefined) patch.looking_for = looking_for;

  // Resume refs: own-bucket proxy paths (`/api/resume/<key>`, key owner
  // must be this user) or external http(s) links. Anything else is 400.
  if ("resume_url" in body) {
    const raw = body.resume_url;
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      patch.resume_url = null;
    } else {
      const normalized = normalizeResumeRef(raw, user.id);
      if (normalized === null) {
        return NextResponse.json({ ok: false, error: "Invalid resume_url" }, { status: 400 });
      }
      patch.resume_url = normalized;
    }
  }

  if ("avatar_url" in body) {
    try {
      patch.avatar_url = parseUrlField(body.avatar_url);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid avatar_url" }, { status: 400 });
    }
  }

  if ("banner_url" in body) {
    try {
      patch.banner_url = parseUrlField(body.banner_url);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid banner_url" }, { status: 400 });
    }
  }

  if ("work_experience" in body) {
    patch.work_experience = sanitizeWorkExperience(body.work_experience);
  }

  if ("recruiter_snapshot" in body) {
    const snap = sanitizeRecruiterSnapshot(body.recruiter_snapshot);
    if (snap === undefined) {
      return NextResponse.json({ ok: false, error: "Invalid recruiter_snapshot" }, { status: 400 });
    }
    patch.recruiter_snapshot = snap;
  }

  if (Object.keys(patch).length === 0 && !handleTouched) {
    return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  const { error: upErr } =
    Object.keys(patch).length > 0
      ? await supabase.from("users").update(patch).eq("id", user.id)
      : { error: null };

  if (upErr) {
    console.error("[me/profile PATCH]", upErr);
    return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });
  }

  // email / school_email are private columns (no RLS read); self-read via
  // the service role scoped to the caller's id.
  const { data: row, error: selErr } = await createSupabaseServiceClient()
    .from("users")
    .select(
      "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,interests,skills,looking_for,work_experience,recruiter_snapshot",
    )
    .eq("id", user.id)
    .single();

  if (selErr || !row) {
    return NextResponse.json({ ok: true, profile: null });
  }

  return NextResponse.json({
    ok: true,
    profile: row,
  });
}
