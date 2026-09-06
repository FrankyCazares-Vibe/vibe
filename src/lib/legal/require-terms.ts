import "server-only";

import { NextResponse } from "next/server";

import { CONSENT_COLUMNS, hasRecordedConsent } from "@/lib/legal/terms";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The 403 every content-producing route returns until consent is on record. */
export function termsRequiredResponse() {
  return NextResponse.json(
    { ok: false, error: "Accept the Terms to continue", code: "terms_required" },
    { status: 403 },
  );
}

/**
 * API-side consent gate (S53 A4). The server-rendered pages redirect to
 * /auth/terms, but the static `?app=1` shells and any direct caller reach the
 * write APIs without passing through them, so each content-producing route
 * (posts, comments, messages, uploads, profile writes, school-email) calls
 * this right after auth. Returns the response to send (403 `terms_required`,
 * or 500 on a read failure) or `null` when the caller may proceed.
 *
 * The consent columns are service-role only, so the self-read goes through
 * the service client scoped to the caller's id.
 */
export async function requireTermsAccepted(userId: string): Promise<NextResponse | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select(CONSENT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[require-terms]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!hasRecordedConsent(data)) return termsRequiredResponse();
  return null;
}
