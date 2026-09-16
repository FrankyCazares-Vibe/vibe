"use client";

import { useSyncExternalStore, type ComponentType, type CSSProperties } from "react";

import { OnboardingMobile } from "@/components/mobile/OnboardingMobile";
import type { OnboardingBoot } from "@/lib/onboarding/boot";
import { MOBILE_BREAKPOINT_PX } from "@/lib/use-is-mobile";

/**
 * Props the phone tree accepts. `replay` is what the component takes today;
 * the boot fields are OPTIONAL so this file compiles against the current
 * `OnboardingMobile` (wave 3 B12 adopts them). Exported so B12 can implement
 * exactly this shape.
 */
export type OnboardingPhoneProps = { replay: boolean } & Partial<Omit<OnboardingBoot, "replay">>;

/**
 * The phone component under the props it will accept. Assigning it here rather
 * than spreading unknown props at the call site keeps the extra fields
 * type-checked the day B12 declares them.
 */
const OnboardingPhone: ComponentType<OnboardingPhoneProps> = OnboardingMobile;

type Layout = "phone" | "desktop";

/**
 * The one decision, made the first time a client render asks for it and then
 * frozen for the life of the tab (see the component docblock). Module scope on
 * purpose: a client-side navigation back into `/onboarding` must get the same
 * answer, not a fresh measurement.
 */
let decidedLayout: Layout | null = null;

function readLayout(): Layout {
  if (decidedLayout) return decidedLayout;
  const narrow =
    typeof window.matchMedia === "function"
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`).matches
      : window.innerWidth < MOBILE_BREAKPOINT_PX;
  decidedLayout = narrow ? "phone" : "desktop";
  return decidedLayout;
}

/** The server has no viewport: it renders the neutral shell, and so does hydration. */
function readServerLayout(): Layout | null {
  return null;
}

/** Nothing to subscribe to — the answer never changes once it is read. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Viewport-based fork for `/onboarding`.
 *
 * Desktop  → iframe the existing static HTML page at `/onboarding/classic`
 *            so the custom cursor + warp overlay + inline scripts keep
 *            working without any change. That page reads the same boot data
 *            from its injected `<script id="onbBoot">`.
 * Mobile   → `OnboardingMobile`, the native React rebuild of the flow.
 *
 * PICKED ONCE, NEVER SWAPPED (plan 2026-09-15 §3.3). The old `useIsMobile()`
 * hook re-reads the media query on every resize, so crossing 900 px mid-flow
 * unmounted the whole tree and wiped every answer the student had typed — a
 * rotation or an iPad split view was enough. This decides on the first client
 * render and then ignores the viewport for the rest of the session; it also
 * stops a phone from ever starting to load the desktop iframe.
 *
 * SSR-safe: the server has no viewport, so it renders a neutral full-screen
 * shell in the page's own background colour, and so does hydration (the server
 * snapshot is `null`) — identical markup, no hydration mismatch. React then
 * reads the real snapshot once and swaps in the chosen tree.
 *
 * `useSyncExternalStore` with a subscription to nothing is the shape of "read
 * one client-only fact, after hydration, exactly once": the snapshot is cached
 * at module scope, so every later read returns the same string and no resize
 * event can ever produce a second answer.
 */
export function OnboardingSwitch({ boot }: { boot: OnboardingBoot }) {
  const layout = useSyncExternalStore(subscribeToNothing, readLayout, readServerLayout);

  if (layout === null) {
    return <div style={bootShellStyle} aria-hidden="true" />;
  }

  if (layout === "phone") {
    return (
      <OnboardingPhone
        replay={boot.replay}
        userId={boot.userId}
        system={boot.system}
        prefill={boot.prefill}
        singleCampusId={boot.singleCampusId}
      />
    );
  }

  return (
    <iframe
      src={`/onboarding/classic${boot.replay ? "?replay=1" : ""}`}
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

/** Same charcoal as both onboarding surfaces, so the swap isn't a flash. */
const bootShellStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#1C1C1E",
};
