"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { ONBOARDING_STATIC_PATH } from "@/lib/auth/email-confirm-redirect";

/**
 * Full navigation to static Otto onboarding. No auth check here: school-verification
 * links are often opened in email in-app browsers where Supabase cookies never
 * attach, which was sending people to login/sign-up by mistake.
 */
function OnboardingBridgeInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    window.location.replace(
      q ? `${ONBOARDING_STATIC_PATH}?${q}` : ONBOARDING_STATIC_PATH,
    );
  }, [searchParams]);

  return (
    <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
      Opening Otto…
    </p>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
          Loading…
        </p>
      }
    >
      <OnboardingBridgeInner />
    </Suspense>
  );
}
