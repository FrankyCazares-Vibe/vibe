import { NextResponse } from "next/server";

import { TERMS_VERSION } from "@/lib/legal/terms";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { terms_version?: unknown };

/**
 * POST /api/me/accept-terms — record the signed-in user's agreement to the
 * current Terms of Service / Privacy Policy and their 18+ attestation.
 *
 * Used by the /auth/terms interstitial, which server entry pages show to
 * any user whose `terms_accepted_at` is NULL (existing accounts created
 * before consent capture, or signups whose metadata was missing). New
 * signups are stamped by the `handle_new_user` trigger instead.
 *
 * `terms_version` in the body must equal the current TERMS_VERSION so a
 * stale client can't record agreement to an older version. The consent
 * columns are service-role only (no column grants to `authenticated`), so
 * the write goes through the service client scoped to the caller's id.
 *
 * Order matters: an append-only `terms_acceptances` row is written FIRST
 * (service-role only, never overwritten), then the current-state columns on
 * `users` are stamped. If the history insert fails we return 500 without
 * touching `users`, so a retry produces a consistent pair; if the stamp
 * fails after the insert, the retry just appends one more history row.
 * Idempotent from the client's point of view: a second call re-stamps the
 * timestamps and adds another history row.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`accept-terms:${user.id}`, { limit: 10, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.terms_version !== TERMS_VERSION) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please reload and accept the current Terms.",
        code: "terms_version_mismatch",
        terms_version: TERMS_VERSION,
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const service = createSupabaseServiceClient();

  const { error: historyErr } = await service.from("terms_acceptances").insert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    accepted_at: now,
    age_attested: true,
    source: "interstitial",
  });
  if (historyErr) {
    console.error("[me/accept-terms] history insert", historyErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const { data: row, error } = await service
    .from("users")
    .update({
      terms_version: TERMS_VERSION,
      terms_accepted_at: now,
      age_attested_at: now,
    })
    .eq("id", user.id)
    .select("terms_version, terms_accepted_at")
    .maybeSingle();

  if (error) {
    console.error("[me/accept-terms]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    terms_version: String(row.terms_version ?? TERMS_VERSION),
    terms_accepted_at: String(row.terms_accepted_at ?? now),
  });
}
