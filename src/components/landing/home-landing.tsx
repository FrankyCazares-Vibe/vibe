"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";

import { OttoOrb } from "@/components/the-map/OttoOrb";
import { enabledSchoolSystems } from "@/lib/auth/school-email-domains";
import { SYSTEM_LABEL } from "@/lib/iu/campuses";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/native/store-links";
import { isIosPlatform, type Platform } from "@/lib/pwa/display-mode";
import { usePlatform } from "@/lib/pwa/use-standalone";
import { useIsMobile } from "@/lib/use-is-mobile";

import { OrbitalRingSystem, OrbitDetail, type RingId } from "./landing-orbit";
import { TypewriterSequence } from "./landing-typewriter";

const WARP_DURATION_MS = 750;
const LOGIN_HREF = "/auth/login";
const SIGNUP_HREF = "/auth/signup";
// Reads the code flag PURDUE_SIGNUPS_ENABLED (never an env var), so the server
// render and the hydrated page agree. Turning Purdue off removes its chip.
const LANDING_SCHOOL_LABELS: readonly string[] = enabledSchoolSystems().map((s) => SYSTEM_LABEL[s]);

// Module-level so the array reference is stable across re-renders — passing
// an inline literal to TypewriterSequence makes its useEffect deps "change"
// every render and re-types the intro from scratch each time the parent
// updates state.
//
// Desktop keeps the two-line cadence ("vibe." / "I'm Otto. This is your
// campus…"). On mobile the second line was too long and wrapped its
// brand-coral period onto its own line, which looked broken. Splitting
// it into three shorter beats fixes the wrap and gives Otto more
// presence on the small screen.
const HERO_SENTENCES_DESKTOP = [
  "Hey, welcome to vibe.",
  "I'm Otto. This is your campus, all in one place.",
];
const HERO_SENTENCES_MOBILE = [
  "Hey, welcome to vibe.",
  "I'm Otto.",
  "This is your campus, all in one place.",
];

// The store listings (APP_STORE_URL / PLAY_STORE_URL) come from
// src/lib/native/store-links.ts, shared with /get and Settings: null until
// that store's env var holds a real listing for that store, so a typo or a
// half-filled env var renders no link rather than a link to somewhere else.
type StoreLink = { key: string; href: string; lead: string; store: string };

const APP_STORE_LINK: StoreLink | null = APP_STORE_URL
  ? { key: "app-store", href: APP_STORE_URL, lead: "Get Vibe on", store: "the App Store" }
  : null;
const PLAY_STORE_LINK: StoreLink | null = PLAY_STORE_URL
  ? { key: "play-store", href: PLAY_STORE_URL, lead: "Get Vibe on", store: "Google Play" }
  : null;

/**
 * Which store links to show. A phone sees only its own store, and nothing
 * when that store isn't set: an iPhone shown a Google Play link is a dead
 * button. A computer, and the server render before the platform is known,
 * sees every store that is set. Neither set means an empty list, and the
 * block renders nothing at all.
 */
function storeLinksFor(platform: Platform | null): StoreLink[] {
  if (isIosPlatform(platform)) return APP_STORE_LINK ? [APP_STORE_LINK] : [];
  if (platform?.startsWith("android-")) return PLAY_STORE_LINK ? [PLAY_STORE_LINK] : [];
  return [APP_STORE_LINK, PLAY_STORE_LINK].filter((l): l is StoreLink => l !== null);
}

// Footer: who runs Vibe and the pages App Review looks for. Brighter than the
// footer's own 0.35 text so the links read as links on the dark background.
const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/community", label: "Guidelines" },
  { href: "/support", label: "Support" },
] as const;

const FOOTER_LINK_STYLE: CSSProperties = {
  display: "inline-block",
  padding: "4px 0",
  color: "rgba(250,247,242,0.7)",
  textDecoration: "none",
};

const RING_ORDER: RingId[] = ["pulse", "scene", "connect"];
const RING_COLOR: Record<RingId, string> = {
  pulse: "#FF5C35",
  scene: "#F5C842",
  connect: "#7B5FE0",
};

export function HomeLanding() {
  const router = useRouter();
  const [focused, setFocused] = useState<RingId | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [warping, setWarping] = useState(false);
  const [visited, setVisited] = useState<Set<RingId>>(() => new Set());
  const unlocked = visited.size === RING_ORDER.length;
  const isMobile = useIsMobile();
  const heroSentences = isMobile ? HERO_SENTENCES_MOBILE : HERO_SENTENCES_DESKTOP;

  const handlePick = (id: RingId) => {
    setFocused(id);
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // Hyperdrive: intercept any element marked data-warp-trigger, play the
  // streak animation, then navigate to that element's own href (sign-up for
  // the sun and the "new here" link, login for returning users). Capture
  // phase + stopPropagation so we beat Next.js Link's onClick (which would
  // otherwise navigate immediately and skip the animation). Skip
  // modifier-clicks so cmd/ctrl/middle-click still open in a new tab.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (warping) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest("[data-warp-trigger]");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      // Whichever element carries data-warp-trigger gets the warp — gating
      // (visit-all-three) is enforced at render time by deciding which
      // elements expose the attribute. The Skip link bypasses the gate
      // for returning users by always exposing it.
      const href = trigger.getAttribute("href");
      const dest = href && href.startsWith("/") ? href : LOGIN_HREF;
      setWarping(true);
      router.prefetch(dest);
      window.setTimeout(() => router.push(dest), WARP_DURATION_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, warping]);

  // When a ring gets focused, scroll the orbital section into view so the
  // dolly transition isn't happening below the fold.
  useEffect(() => {
    if (!focused) return;
    const el = document.getElementById("vibe-landing-orbit-section");
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focused]);

  // Allow ESC to back out of orbit detail.
  useEffect(() => {
    if (!focused) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocused(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  return (
    <div className={`vibe-landing-root ${warping ? "vibe-landing-warp" : ""}`}>
      <Starfield />

      {/* ---- Hero — typewriter ----------------------------------------- */}
      <section className="vibe-landing-hero">
        <div className="vibe-landing-hero-orb">
          <OttoOrb size={56} />
        </div>
        {/* Keyed by viewport class so the typewriter remounts cleanly when
            the user resizes across the breakpoint — otherwise the internal
            `typed` state (sized to the old array length) goes out of sync
            with the new sentence count. */}
        <TypewriterSequence
          key={isMobile ? "mobile" : "desktop"}
          sentences={heroSentences}
          speed={60}
          pauseBetween={700}
          onDone={() => setIntroDone(true)}
        />
        <div
          className="vibe-landing-scrollcue"
          style={{ opacity: introDone ? 1 : 0 }}
          aria-hidden
        >
          <span className="vibe-landing-scrollcue-line" />
          <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            scroll
          </span>
        </div>
      </section>

      {/* ---- Orbital scene --------------------------------------------- */}
      <section id="vibe-landing-orbit-section" className="vibe-landing-orbit-section">
        <div className="vibe-landing-orbit-eyebrow">
          {focused
            ? "What this form does"
            : unlocked
              ? "All three explored. You're in."
              : `Pick a form to see how it works · ${visited.size}/${RING_ORDER.length}`}
        </div>
        <div className="vibe-landing-orbit-stage">
          <OrbitalRingSystem focused={focused} onPick={handlePick} unlocked={unlocked} />
          <OrbitDetail focused={focused} onClose={() => setFocused(null)} />
        </div>
      </section>

      {/* ---- Bottom rail: progress + hint + schools ------------------- */}
      <section className="vibe-landing-cta">
        <div className="vibe-landing-cta-progress" aria-label={`${visited.size} of ${RING_ORDER.length} forms explored`}>
          {RING_ORDER.map((id) => {
            const isVisited = visited.has(id);
            return (
              <span
                key={id}
                className={`vibe-landing-cta-progress-dot${isVisited ? " is-visited" : ""}`}
                style={{
                  borderColor: RING_COLOR[id],
                  background: isVisited ? RING_COLOR[id] : "transparent",
                  boxShadow: isVisited ? `0 0 12px ${RING_COLOR[id]}90` : "none",
                }}
              />
            );
          })}
        </div>

        <p className="vibe-landing-cta-hint">
          {unlocked
            ? "Tap the sun to step inside."
            : `Tap each form above to keep going · ${visited.size}/${RING_ORDER.length}`}
        </p>

        <div className="vibe-landing-schools">
          {LANDING_SCHOOL_LABELS.map((label, i) => (
            <Fragment key={label}>
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              <span>{label}</span>
            </Fragment>
          ))}
          <span className="vibe-landing-schools-soon">live</span>
        </div>

        <p className="vibe-landing-cta-foot">
          Sign up with your school email. Your campus, your career, one profile.
        </p>

        {/* Both doors are always visible: a new student should never have to
            discover the three-ring dance to find the sign-up. */}
        <a
          href={SIGNUP_HREF}
          data-warp-trigger
          className="vibe-landing-skip vibe-landing-signup"
        >
          New here?{" "}
          <span className="vibe-landing-skip-action">
            Create your account <span aria-hidden style={{ marginLeft: 4 }}>→</span>
          </span>
        </a>
        <a
          href={LOGIN_HREF}
          data-warp-trigger
          className="vibe-landing-skip vibe-landing-skip-secondary"
        >
          Already have an account?{" "}
          <span className="vibe-landing-skip-action">
            Log in <span aria-hidden style={{ marginLeft: 4 }}>→</span>
          </span>
        </a>

        <StoreLinks />
      </section>

      {/* No data-warp-trigger here or on anything around it: the capture
          handler above would hijack these links through closest() and play
          the warp before opening them (and any href not starting with "/"
          would go to /auth/login instead). The footer rule doesn't wrap, and
          uppercase with wide tracking overflows a 375px phone, so the row
          wraps here. */}
      <footer
        className="vibe-landing-footer"
        style={{ flexWrap: "wrap", gap: "8px 16px" }}
      >
        <span>© CONNECTVIBE. LLC</span>
        <nav
          aria-label="Legal and support"
          style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}
        >
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={FOOTER_LINK_STYLE}>
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* "Get Vibe on …" — the store listings, once they exist.                   */
/* ---------------------------------------------------------------------- */

/**
 * Store links under the two doors (Franky's decision D3: install means the
 * real store apps). Renders NOTHING while NEXT_PUBLIC_APP_STORE_URL and
 * NEXT_PUBLIC_PLAY_STORE_URL are both unset, so the landing never shows a
 * button that goes nowhere.
 *
 * Plain text links on purpose, never a drawn badge: Apple and Google each
 * publish official badge art with rules about how it's used, and an imitation
 * is worse than none.
 * TODO(Franky): swap each text link for the official badge ("Download on the
 * App Store", "Get it on Google Play") once you've downloaded the art from
 * Apple's and Google's marketing pages, and add a QR code to /get for
 * computers. The store app itself should never show this block (it would be
 * an ad for the app you're already in): hide it there when the shell lands.
 *
 * Like the footer, nothing here carries data-warp-trigger: these links leave
 * Vibe, and the warp would turn any href not starting with "/" into /auth/login.
 */
function StoreLinks() {
  const platform = usePlatform();
  const links = storeLinksFor(platform);
  if (links.length === 0) return null;
  return (
    <nav
      aria-label="Get the Vibe app"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "10px 24px",
        marginTop: 4,
      }}
    >
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(250,247,242,0.8)",
            textDecoration: "none",
          }}
        >
          {l.lead}{" "}
          <span style={{ color: "#FF5C35", fontWeight: 700 }}>{l.store}</span>
          <span aria-hidden style={{ marginLeft: 6 }}>→</span>
        </a>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------------------- */
/* Sparse twinkling star field — deterministic so SSR + client match.       */
/* ---------------------------------------------------------------------- */

function Starfield() {
  // Pre-stringified at fixed precision so SSR + client render byte-identical
  // inline styles. Also emits per-star radial vectors (--sc/--ss/--sa) the
  // hyperdrive keyframe reads to streak each star outward from page center.
  const stars = useMemo(() => {
    const noise = (i: number, k: number) => {
      const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return ((v % 1) + 1) % 1;
    };
    const fix = (n: number, d: number) => n.toFixed(d);
    return Array.from({ length: 70 }, (_, i) => {
      const xPct = noise(i, 1) * 100;
      const yPct = noise(i, 2) * 100;
      const dx = xPct - 50;
      const dy = yPct - 50;
      // Avoid divide-by-zero for stars exactly at center; nudge outward.
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const cos = dx / len;
      const sin = dy / len;
      const angle = Math.atan2(dy, dx);
      const size = fix(1 + noise(i, 3) * 1.8, 2);
      return {
        left: `${fix(xPct, 3)}%`,
        top: `${fix(yPct, 3)}%`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: fix(0.25 + noise(i, 6) * 0.55, 3),
        animationDelay: `${fix(noise(i, 4) * 4, 2)}s`,
        animationDuration: `${fix(3 + noise(i, 5) * 4, 2)}s`,
        sc: fix(cos, 4),
        ss: fix(sin, 4),
        sa: `${fix(angle, 4)}rad`,
      };
    });
  }, []);

  return (
    <div className="vibe-landing-stars" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          style={
            {
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              opacity: s.opacity,
              animationDelay: s.animationDelay,
              animationDuration: s.animationDuration,
              "--sc": s.sc,
              "--ss": s.ss,
              "--sa": s.sa,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
