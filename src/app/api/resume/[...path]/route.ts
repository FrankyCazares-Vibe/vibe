import { NextResponse } from "next/server";

import {
  RESUME_KEY_RE,
  resumeKeyOwnerId,
} from "@/lib/profile/resume-doc-url";
import {
  resumeKeysReferenced,
  signResumeGetUrl,
} from "@/lib/profile/resume-storage";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ path: string[] }> };

const SIGNED_TTL_SEC = 300;
const NO_STORE = { "cache-control": "private, no-store" } as const;

/**
 * GET /api/resume/<uid>/resume-<uuid>.<ext>[?json=1]
 *
 * The only browser-facing read path for the PRIVATE `resumes` bucket.
 * 307-redirects (or, with `?json=1`, returns `{ ok, url, expiresIn }`) to
 * a signed URL that lives for SIGNED_TTL_SEC seconds.
 *
 * Invariant enforced before anything is signed:
 *   1. key matches RESUME_KEY_RE — the owner id is the key's first segment;
 *   2. requester is signed in (anonymous visitors never get resumes);
 *   3. requester === owner, OR both of:
 *      a. the OWNER row (looked up by the id derived from the key, never by
 *         the requester's row) still references this key in `resume_url`
 *         or `resume_docs` — so a removed doc is unreachable to others
 *         immediately, and a row that points at someone else's key buys
 *         nothing;
 *      b. no `blocks` row exists in either direction.
 *
 * Every failure is a 404 (no distinction between missing / removed /
 * blocked) except auth (401), rate limit (429) and signing errors (500).
 *
 * Accepted residual: redaction bars are still client-side overlays, so a
 * signed-in, non-blocked viewer can fetch the un-redacted bytes during the
 * TTL. Tracked for server-side redaction later.
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  const key = Array.isArray(path) ? path.join("/") : "";
  if (!RESUME_KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`resume-get:${user.id}`, { limit: 120, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const ownerId = resumeKeyOwnerId(key);
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const service = createSupabaseServiceClient();
  const { data: row, error: rowErr } = await service
    .from("users")
    .select("id, resume_url, resume_docs")
    .eq("id", ownerId)
    .maybeSingle();
  if (rowErr) {
    console.error("[resume GET] owner lookup", rowErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (user.id !== ownerId) {
    // Membership is enforced for third-party viewers only. The owner may
    // fetch any key under their own prefix: onboarding previews the file
    // right after upload, before the row references it, and an owner
    // seeing their own not-yet-purged object is harmless.
    const refs = resumeKeysReferenced(
      (row as { resume_url: unknown }).resume_url,
      (row as { resume_docs: unknown }).resume_docs,
    );
    if (!refs.has(key)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Both ids are validated UUIDs (auth + RESUME_KEY_RE), so the PostgREST
    // filter string is injection-safe. Same shape as users/[handle]/bootstrap.
    const { data: blockRows, error: blockErr } = await service
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${ownerId},blocked_id.eq.${user.id}),` +
          `and(blocker_id.eq.${user.id},blocked_id.eq.${ownerId})`,
      )
      .limit(1);
    if (blockErr) {
      console.error("[resume GET] block check", blockErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if ((blockRows ?? []).length > 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
  }

  let signed: string;
  try {
    signed = await signResumeGetUrl(key, SIGNED_TTL_SEC);
  } catch (e) {
    console.error("[resume GET] sign", e);
    return NextResponse.json(
      { ok: false, error: "Could not sign document" },
      { status: 500 },
    );
  }

  if (new URL(req.url).searchParams.get("json") === "1") {
    return NextResponse.json(
      { ok: true, url: signed, expiresIn: SIGNED_TTL_SEC },
      { headers: NO_STORE },
    );
  }
  return NextResponse.redirect(signed, { status: 307, headers: NO_STORE });
}
