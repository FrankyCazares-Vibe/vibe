"use client";

import { OnboardingMobile } from "@/components/mobile/OnboardingMobile";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Viewport-based fork for `/onboarding`.
 *
 * Desktop  → iframe the existing static HTML page at `/onboarding/classic`
 *            so the custom cursor + warp overlay + inline scripts keep
 *            working without any change.
 * Mobile   → `OnboardingMobile` — native React rebuild of the same 4
 *            steps (intro / profile / experience / resume) laid out
 *            single-column with a sticky bottom CTA.
 */
export function OnboardingSwitch({ replay }: { replay: boolean }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <OnboardingMobile replay={replay} />;
  }

  return (
    <iframe
      src={`/onboarding/classic${replay ? "?replay=1" : ""}`}
      title="Onboarding"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: 0,
        margin: 0,
        padding: 0,
        background: "#1C1C1E",
      }}
    />
  );
}
