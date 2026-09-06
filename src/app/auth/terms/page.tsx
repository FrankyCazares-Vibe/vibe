import { redirect } from "next/navigation";

import { isSafeRelativePath } from "@/lib/auth/login-next";
import { hasRecordedConsent, CONSENT_COLUMNS } from "@/lib/legal/terms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { AcceptTermsForm } from "./accept-terms-form";

export const metadata = {
  title: "Terms · Vibe",
  description: "Confirm you're 18+ and agree to the Terms of Service.",
};

const TERMS_GATE_PATH = "/auth/terms";

/**
 * Where to go after accepting when no (safe) `next` was given. `/onboarding`
 * is the smart entry: its server page forwards to school verification, Otto,
 * or the profile depending on where the user actually is.
 */
const DEFAULT_NEXT = "/onboarding";

/** Same-origin path only, and never this page itself (no redirect loops). */
function resolveNext(raw: string | string[] | undefined): string {
  const next = Array.isArray(raw) ? raw[0] : raw;
  if (!isSafeRelativePath(next)) return DEFAULT_NEXT;
  const pathOnly = next.split("?")[0] ?? "";
  if (pathOnly === TERMS_GATE_PATH || pathOnly.startsWith(`${TERMS_GATE_PATH}/`)) {
    return DEFAULT_NEXT;
  }
  return next;
}

/**
 * `/auth/terms` — consent interstitial (S53 A4).
 *
 * Existing accounts were created before we recorded Terms agreement or an
 * 18+ attestation, so the server-rendered entry pages (onboarding, campus,
 * settings) and the content-producing APIs send anyone without a complete,
 * current consent record (`hasRecordedConsent`) here. One tap stamps the row via
 * `POST /api/me/accept-terms`, then we forward to `?next=`.
 *
 * Already-accepted users are forwarded straight through so this page can
 * never trap someone, and a bad/missing `next` falls back to `/onboarding`.
 */
export default async function TermsGatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = resolveNext(params.next);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = `${TERMS_GATE_PATH}?next=${encodeURIComponent(next)}`;
    redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  }

  // The consent columns are private (service-role only, like email);
  // self-read scoped to the signed-in user's id.
  const { data: row } = await createSupabaseServiceClient()
    .from("users")
    .select(CONSENT_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (hasRecordedConsent(row)) {
    redirect(next);
  }

  return <AcceptTermsForm next={next} />;
}
