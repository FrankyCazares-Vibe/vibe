import { NextResponse } from "next/server";

import { passwordMissing, readPasswordFlag } from "@/lib/auth/password-needed";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** Only the version is read. Anything else (a `source`, say) is ignored: the server decides the source. */
type Body = { terms_version?: unknown };

/**
 * POST /api/me/accept-terms — record the signed-in user's agreement to the
 * current Terms of Service / Privacy Policy and their 18+ attestation.
 *
 * Used by the /auth/terms interstitial, which server entry pages show to
 * any user whose `terms_accepted_at` is NULL (existing accounts created
 * before consent capture, or signups whose metadata was missing), by the
 * "Choose your password" screen, and by the sign-up page right after the
 * code. New signups are stamped by the `handle_new_user` trigger at insert.
 *
 * Pre-registration fix (Oct 2026): the first confirmation of an address Vibe
 * emailed removes the password, the starter name and the Terms tick chosen
 * before the inbox was proven, and stamps `users.password_needed_at`
 * (`auth_hooks.first_confirm_drops_password`). For such a flagged account:
 *   - no password yet: 409 `password_needed`, nothing written, so "consent
 *     recorded" always means "a password chosen after the inbox was proven";
 *   - a password: recorded with source `confirm` and the flag cleared;
 *   - could not tell (the check failed): recorded `confirm`, the flag kept
 *     (fail open; the database wipe is the security, this only finishes setup).
 * No flag (or the column not there yet) is exactly the old behaviour,
 * source `interstitial`. `confirm` is never taken from the client, and only
 * exists once that trigger has set a flag, which needs the migration that
 * widened the source check, so no deploy order can hit the old check.
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

  // A first confirmation removed an early password (see the comment above).
  const flag = await readPasswordFlag(service, user.id);
  let source: "interstitial" | "confirm" = "interstitial";
  let clearFlag = false;
  if (flag) {
    const missing = await passwordMissing(service, user.id);
    if (missing === true) {
      return NextResponse.json(
        { ok: false, code: "password_needed", error: "Choose your password first." },
        { status: 409 },
      );
    }
    // The trigger cleared the first signer's tick: this one is the inbox holder's.
    source = "confirm";
    // Could not tell: record consent, keep the flag (fail open).
    clearFlag = missing === false;
  }

  const { error: historyErr } = await service.from("terms_acceptances").insert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    accepted_at: now,
    age_attested: true,
    source,
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
      // Only once a password is known to exist; never sent without a flag, so a missing column can't fail this.
      ...(clearFlag ? { password_needed_at: null } : {}),
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
