import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isSupabaseHttpsUrl } from "@/lib/org-asset-url";
import { normalizeCoverThemeInput } from "@/lib/profile/cover-themes";
import {
  campusReadUnavailable,
  campusWriteFailed,
  decideProfileCampusWrite,
  readCampusIntent,
  readCampusWriteRow,
  type CampusWriteDecision,
} from "@/lib/profile/profile-campus-write";
import { changeHandleForUser } from "@/lib/profile/handle-change";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { parseLookingForBody } from "@/lib/profile/looking-for";
import { normalizeResumeRef } from "@/lib/profile/resume-doc-url";
import { unexpectedSelfWriteKeys } from "@/lib/profile/self-write-columns";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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

/**
 * Avatar / cover URLs, which are rendered into a CSS `url()` on OTHER
 * students' screens. `parseUrlField` accepts any http(s) host, which made
 * these columns the same IP beacon `banner_gradient` was — no CSS needed.
 * So the value must live on our own Supabase host, the pin
 * `isSupabaseHttpsUrl` already applies to org assets.
 *
 * `null` / "" clears the field. Over-long input is REJECTED rather than
 * sliced: truncating a media URL silently yields a broken image, and a
 * Supabase public object URL is ~120 chars, so the cap is never reached by
 * anything legitimate.
 *
 * Note this returns false for every value when NEXT_PUBLIC_SUPABASE_URL is
 * unset, which would 400 these two fields — an environment without that
 * variable cannot create a Supabase client at all, so the route is already
 * dead by then.
 */
function parseMediaUrlField(val: unknown): string | null {
  if (val === null) return null;
  if (typeof val !== "string") {
    throw new Error("invalid");
  }
  const t = val.trim();
  if (!t) return null;
  if (t.length > 2048 || !isSupabaseHttpsUrl(t)) {
    throw new Error("invalid");
  }
  return t;
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

/**
 * Update the signed-in user's `public.users` row.
 *
 * Every column is validated here and written with the SERVICE role, scoped to
 * the caller's own id, in one statement guarded by the closed column list in
 * `self-write-columns.ts`: migration 20260922130000 takes skills, interests,
 * work_experience and looking_for off the `authenticated` UPDATE grant, so
 * PostgREST can no longer skip these validators. The cookie client is used
 * for `getUser` only.
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

  // One limiter for every caller (avatar save, campus card, onboarding's
  // avatar step): rulings B3.
  const rl = await rateLimit(`me-profile:${user.id}`, { limit: 60, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  // Columns the caller's own client may no longer UPDATE (migration
  // 20260912102000) — written with the service role, scoped to this user,
  // alongside banner_gradient further down.
  const mediaPatch: Record<string, unknown> = {};
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

  // Cover theme. The column stores a preset KEY, never CSS: the old check
  // here ("starts with linear-gradient") passed
  // `linear-gradient(#000,#000),url(https://attacker.example/x)`, and it was
  // never a boundary anyway because the column was UPDATE-granted to
  // `authenticated` and reachable straight through PostgREST. Since
  // migration 20260912100000 the boundary is the CHECK constraint plus the
  // removed grant; this is defence in depth. A raw CSS string from an older
  // client is accepted only when it is exactly one of the presets, and is
  // stored as that preset's key.
  let coverThemePatch: string | undefined;
  if (typeof body.banner_gradient === "string") {
    const key = normalizeCoverThemeInput(body.banner_gradient);
    if (key === null) {
      return NextResponse.json({ ok: false, error: "Invalid banner_gradient" }, { status: 400 });
    }
    coverThemePatch = key;
  }

  const major = trimStr(body.major, 200);
  if (major !== null) patch.major = major;

  const department = trimStr(body.department, 200);
  if (department !== null) patch.department = department;

  // Self-declared campus. TWO BODY SHAPES while the wave-3 clients ship
  // (critic A4): `campus_id` is an explicit choice, while the legacy
  // `school` / `campus` label is what every DEPLOYED bundle sends on every
  // save. So a label naming the campus already on the row — and "" / null —
  // changes nothing: no write, no 400, no 429, no `campus_set_at` touch.
  // Only a DIFFERENT campus is a change, and goes through the allowed set
  // (400 `campus_not_in_system`) and the 30-day rule (429
  // `campus_change_too_soon`). All of that is decided in
  // `decideProfileCampusWrite`.
  //
  // `campus_id` / `campus_set_at` have no UPDATE grant (and `school` loses
  // its own in M2), so the write goes through the service role scoped to
  // this user, below, and dual-writes the legacy label (plan §5.5).
  //
  // A campus rule NEVER fails the rest of the patch: every other field is
  // applied either way and the campus outcome is reported separately.
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
        { ok: false, error: "year must be null or integer 1–12" },
        { status: 400 },
      );
    }
  }

  const interests = stringArray(body.interests, 40, 80);
  if (interests !== undefined) patch.interests = interests;

  const skills = stringArray(body.skills, 60, 80);
  if (skills !== undefined) patch.skills = skills;

  // "What are you here for?" tokens. A non-array stays silently ignored, as
  // it always was on this route; `null` clears the answer.
  const lookingFor = parseLookingForBody(body.looking_for);
  if (Array.isArray(lookingFor)) patch.looking_for = lookingFor;

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
      mediaPatch.avatar_url = parseMediaUrlField(body.avatar_url);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid avatar_url" }, { status: 400 });
    }
  }

  if ("banner_url" in body) {
    try {
      mediaPatch.banner_url = parseMediaUrlField(body.banner_url);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid banner_url" }, { status: 400 });
    }
  }

  if ("work_experience" in body) {
    patch.work_experience = sanitizeWorkExperience(body.work_experience);
  }

  // The professional snapshot card is gone; a body that still carries its
  // field is ignored, never written.

  if (
    Object.keys(patch).length === 0 &&
    Object.keys(mediaPatch).length === 0 &&
    coverThemePatch === undefined &&
    !handleTouched &&
    !campusTouched
  ) {
    return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  // ONE service-role statement for every profile column, scoped to the
  // caller's own id (the shape changeHandleForUser uses for users.handle).
  // Several of these columns are no longer UPDATE-granted to `authenticated`
  // (banner_gradient: 20260912100000; avatar_url / banner_url: 20260912102000;
  // skills, interests, work_experience, looking_for: 20260922130000), and one
  // statement means the fields can never half-apply against each other. The
  // service role passes every grant, so the closed list in
  // `self-write-columns.ts` stands in front of it: a key outside the list is
  // a coding slip and fails the save instead of writing.
  const writePatch: Record<string, unknown> = { ...patch, ...mediaPatch };
  if (coverThemePatch !== undefined) writePatch.banner_gradient = coverThemePatch;

  if (Object.keys(writePatch).length > 0) {
    const bad = unexpectedSelfWriteKeys(writePatch);
    if (bad.length > 0) {
      console.error("[me/profile PATCH] unexpected columns", bad);
      return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });
    }
    const { error: upErr } = await createSupabaseServiceClient()
      .from("users")
      .update(writePatch)
      .eq("id", user.id);
    if (upErr) {
      console.error("[me/profile PATCH]", upErr);
      return NextResponse.json({ ok: false, error: "Could not save profile" }, { status: 500 });
    }
  }

  // Campus, its 30-day stamp and the dual-written legacy label go together in
  // one service-role statement so they can never half-apply against each
  // other. A rejection here is still only a campus failure (see below).
  if (campusDecision.kind === "write") {
    const { error: campusErr } = await createSupabaseServiceClient()
      .from("users")
      .update(campusDecision.patch)
      .eq("id", user.id);
    if (campusErr) {
      console.error("[me/profile PATCH campus]", campusErr);
      campusDecision = campusWriteFailed(campusErr);
    }
  }

  // A campus rule never blocks the fields that did save. When something else
  // was written the request SUCCEEDS and carries `campusError`, so a
  // deployed bundle adopts the server's campus on its next bootstrap instead
  // of failing every later save on the same rejected label (critic A4). A
  // campus-only body has nothing else to report, so the rule's own status is
  // the answer.
  const campusError = campusDecision.kind === "reject" ? campusDecision.rejection : null;
  const wroteOtherFields = Object.keys(writePatch).length > 0 || handleTouched;
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

  // email / school_email are private columns (no RLS read); self-read via
  // the service role scoped to the caller's id.
  //
  // This echo is the RAW row and stays campus-blind on purpose: it carries the
  // dual-written `school` label and no campus columns at all, so a client can't
  // mistake an unasked-for column for "no campus". GET /api/me/profile-bootstrap
  // is the campus source (`campusId`, `campusBadge`, `campusConfirmed`).
  const { data: row, error: selErr } = await createSupabaseServiceClient()
    .from("users")
    .select(
      "id,email,name,handle,school,school_email,school_verified,year,major,department,bio,tagline,website,headline,location_text,banner_gradient,avatar_url,banner_url,resume_url,interests,skills,looking_for,work_experience",
    )
    .eq("id", user.id)
    .single();

  if (selErr || !row) {
    return NextResponse.json({ ok: true, profile: null, ...(campusError ? { campusError } : {}) });
  }

  return NextResponse.json({
    ok: true,
    profile: row,
    ...(campusError ? { campusError } : {}),
  });
}
