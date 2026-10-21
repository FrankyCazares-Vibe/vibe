import { redirect } from "next/navigation";

import { choosePasswordHref } from "@/lib/auth/choose-password-path";
import { isSafeRelativePath } from "@/lib/auth/login-next";
import { passwordMissing, readPasswordFlag } from "@/lib/auth/password-needed";
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
 *
 * Pre-registration fix (Oct 2026): the first confirmation of an address
 * clears the Terms tick, so every account confirmed off the sign-up page
 * lands here. If that confirmation also removed a password chosen before the
 * inbox was proven (`users.password_needed_at`, see
 * src/lib/auth/password-needed.ts) and none exists yet, the "Choose your
 * password" screen comes first: it holds the password AND the Terms box.
 * With a password, this page's form shows, saying the email is confirmed and
 * the box is for the person who reads it (not the older accounts' wording).
 * Checked only once consent is missing, so no accepted account pays for it;
 * on any doubt (no column yet, a failed check) this page shows its form as
 * before, so the two pages can never bounce someone between them.
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
  const service = createSupabaseServiceClient();
  const { data: row } = await service
    .from("users")
    .select(CONSENT_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (hasRecordedConsent(row)) {
    redirect(next);
  }

  // The flag means the first confirmation of this address just cleared its
  // tick (and removed the early password). No password since: choose it
  // first (true only; null = could not tell, and the form shows as before).
  const justConfirmed = (await readPasswordFlag(service, user.id)) !== null;
  if (justConfirmed && (await passwordMissing(service, user.id)) === true) {
    redirect(choosePasswordHref(next));
  }

  // A password exists (or we could not tell): the form, worded for an inbox
  // just proven when the flag is set (they may never have ticked this box:
  // someone else may have signed up with the address), else for an older
  // account that never had its agreement recorded.
  return <AcceptTermsForm next={next} justConfirmed={justConfirmed} />;
}
