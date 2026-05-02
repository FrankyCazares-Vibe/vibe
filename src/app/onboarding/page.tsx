"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ONBOARDING_STATIC_PATH } from "@/lib/auth/email-confirm-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function OnboardingBridgeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        const q = searchParams.toString();
        const onboardingNext = q ? `/onboarding?${q}` : "/onboarding";
        router.replace(
          `/auth/login?next=${encodeURIComponent(onboardingNext)}`,
        );
        return;
      }
      const q = searchParams.toString();
      window.location.href = q
        ? `${ONBOARDING_STATIC_PATH}?${q}`
        : ONBOARDING_STATIC_PATH;
    });
  }, [router, searchParams]);

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
