"use client";

import { Fraunces } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { enabledSchoolSystems } from "@/lib/auth/school-email-domains";
import { SYSTEM_LABEL } from "@/lib/iu/campuses";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/native/store-links";
import { isIosPlatform, type Platform } from "@/lib/pwa/display-mode";
import { usePlatform } from "@/lib/pwa/use-standalone";

import { NightSky, type SkyLight } from "./night-sky";
import "./landing.css";

// The soft wordmark face (the share card's: SOFT 100, opsz 144). The app-wide
// Fraunces link in layout.tsx has no SOFT axis, so the landing loads its own.
const soft = Fraunces({ subsets: ["latin"], axes: ["SOFT", "opsz"], variable: "--font-soft", display: "swap" });

const WARP_DURATION_MS = 750;
const LOGIN_HREF = "/auth/login";
const SIGNUP_HREF = "/auth/signup";
const CLUB_HREF = "mailto:help@connectvibe.app?subject=Bring%20my%20club%20to%20Vibe";
// Reads the code flag PURDUE_SIGNUPS_ENABLED (never an env var), so the server
// render and the hydrated page agree. Turning Purdue off removes its label.
const LANDING_SCHOOL_LABELS: readonly string[] = enabledSchoolSystems().map((s) => SYSTEM_LABEL[s]);

type Kind = "clubs" | "events" | "people";

/** The three things you can do. `rgb` is the colour that kind's lights lean toward. */
const KINDS: Record<Kind, { eyebrow: string; title: string; body: string; rgb: string; screen: string | null }> = {
  clubs: { eyebrow: "Clubs", title: "Find your clubs.", body: "Follow the ones you're curious about, join the ones you love, and keep up with their posts and chats in one place.", rgb: "255,92,53", screen: null },
  events: { eyebrow: "Events", title: "See what's on.", body: "Everything happening on campus this week, in one place. RSVP in a tap so you never miss it.", rgb: "246,196,104", screen: null },
  people: { eyebrow: "Each other", title: "Find each other.", body: "Meet people from your major and your clubs, and make your profile look like you.", rgb: "150,186,255", screen: null },
};
const KIND_ORDER: Kind[] = ["clubs", "events", "people"];

/** The lights in the hero sky. Invented, generic names: never a real club or person. */
const LIGHTS: (SkyLight & { kind: Kind; label: string })[] = [
  { id: "film", kind: "clubs", label: "Film club", rgb: "255,92,53", size: 9, m: [0.2, 0.17], d: [0.56, 0.26] },
  { id: "robotics", kind: "clubs", label: "Robotics", rgb: "255,146,124", size: 6, m: [0.8, 0.14], d: [0.86, 0.2] },
  { id: "tonight", kind: "events", label: "Tonight, 7 pm", rgb: "246,196,104", size: 11, m: [0.62, 0.29], d: [0.72, 0.42] },
  { id: "openmic", kind: "events", label: "Open mic", rgb: "255,224,170", size: 6, m: [0.14, 0.36], d: [0.58, 0.64] },
  { id: "study", kind: "people", label: "Study group", rgb: "150,186,255", size: 8, m: [0.4, 0.45], d: [0.8, 0.7] },
  { id: "major", kind: "people", label: "From your major", rgb: "196,178,255", size: 6, m: [0.82, 0.44], d: [0.92, 0.48] },
];
const LINKS: [number, number][] = [[0, 2], [1, 2], [0, 3], [3, 4], [2, 4], [2, 5], [4, 5]];

const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/community", label: "Guidelines" },
  { href: "/support", label: "Support" },
] as const;

// The store listings come from src/lib/native/store-links.ts: null until that
// store's env var holds a real listing, so a half-filled env var renders no link.
type StoreLink = { key: string; href: string; store: string };
const APP_STORE_LINK: StoreLink | null = APP_STORE_URL ? { key: "app-store", href: APP_STORE_URL, store: "the App Store" } : null;
const PLAY_STORE_LINK: StoreLink | null = PLAY_STORE_URL ? { key: "play-store", href: PLAY_STORE_URL, store: "Google Play" } : null;

/** A phone sees only its own store; a computer (and the server render) sees every store that is set. */
function storeLinksFor(platform: Platform | null): StoreLink[] {
  if (isIosPlatform(platform)) return APP_STORE_LINK ? [APP_STORE_LINK] : [];
  if (platform?.startsWith("android-")) return PLAY_STORE_LINK ? [PLAY_STORE_LINK] : [];
  return [APP_STORE_LINK, PLAY_STORE_LINK].filter((l): l is StoreLink => l !== null);
}

const at = (l: SkyLight, i: number, rgb: string) => ({ "--mx": l.m[0], "--my": l.m[1], "--dx": l.d[0], "--dy": l.d[1], "--i": i, "--rgb": rgb }) as CSSProperties;

export function HomeLanding() {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [warping, setWarping] = useState(false);
  // The light under a mouse. A tap toggles its card; a click on a light the
  // mouse already opened leaves it open (a touch fires neither enter nor leave here).
  const hovered = useRef<string | null>(null);
  const open = LIGHTS.find((l) => l.id === active) ?? null;

  // The warp: any element marked data-warp-trigger plays the streak, then
  // goes to its own href. Capture phase so it beats Next's Link; modifier
  // clicks still open a new tab. With reduced motion it navigates at once.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (warping || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const trigger = (e.target as HTMLElement | null)?.closest("[data-warp-trigger]");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      const href = trigger.getAttribute("href");
      const dest = href && href.startsWith("/") ? href : LOGIN_HREF;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setWarping(true);
      router.prefetch(dest);
      window.setTimeout(() => router.push(dest), still ? 0 : WARP_DURATION_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, warping]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Everything below the hero emerges with the scroll: each .vln-rise gets
  // --p, 0 below the fold to 1 once it is well into view, and landing.css
  // turns that into the slide, the scale and the glow. offsetTop, not
  // getBoundingClientRect: the transform must not feed back into its own input.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".vln-rise"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((el) => el.style.setProperty("--p", "1"));
      return;
    }
    let raf = 0;
    const run = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of els) {
        const lag = Number(el.dataset.lag ?? 0) * vh * 0.07;
        const u = Math.min(1, Math.max(0, (vh * 0.98 - (el.offsetTop - window.scrollY) - lag) / (vh * 0.42)));
        el.style.setProperty("--p", (1 - Math.pow(1 - u, 3)).toFixed(3));
      }
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
    };
  }, []);

  return (
    <div className={`vln-root ${soft.variable}${warping ? " is-warping" : ""}`}>
      <header className="vln-bar">
        <span className="vln-wordmark">vibe<i>.</i></span>
        <nav aria-label="Account">
          <a href={LOGIN_HREF} data-warp-trigger className="vln-textlink">Log in</a>
          <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn vln-btn-sm">Sign up</a>
        </nav>
      </header>

      <section className="vln-hero" onClick={() => setActive(null)}>
        <NightSky lights={LIGHTS} links={LINKS} activeId={active} warping={warping} />
        {LIGHTS.map((l, i) => (
          <button
            key={l.id}
            type="button"
            className="vln-light"
            style={at(l, i, l.rgb)}
            aria-expanded={active === l.id}
            aria-controls="vln-pop"
            onClick={(e) => { e.stopPropagation(); setActive(active === l.id && hovered.current !== l.id ? null : l.id); }}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") { hovered.current = l.id; setActive(l.id); } }}
            onPointerLeave={() => { hovered.current = null; }}
          >
            <span className="vln-light-label">{l.label}</span>
          </button>
        ))}
        {open ? (
          <div id="vln-pop" className="vln-pop" style={at(open, 0, open.rgb)} onClick={(e) => e.stopPropagation()}>
            <span className="vln-eyebrow">{KINDS[open.kind].eyebrow}</span>
            <strong>{KINDS[open.kind].title}</strong>
            <p>{KINDS[open.kind].body}</p>
            <a href={`#vln-${open.kind}`} onClick={() => setActive(null)}>More below <span aria-hidden="true">↓</span></a>
          </div>
        ) : null}

        <div className="vln-hero-copy">
          <h1>The social app for <em>your campus.</em></h1>
          <p>Find your clubs, your events, and each other. Free with your school email.</p>
          <div className="vln-cta">
            <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn">Sign up</a>
            <a href="#vln-doors" className="vln-btn vln-btn-ghost">Bring your club</a>
          </div>
          <span className="vln-hint">Tap a light to see what&apos;s out there.</span>
        </div>
      </section>

      <div className="vln-rule vln-rise"><span>What&apos;s out there</span><i aria-hidden="true" /><span aria-hidden="true">01 — 03</span></div>
      <section className="vln-kinds" aria-label="What you can do on Vibe">
        {KIND_ORDER.map((k, i) => (
          <article key={k} id={`vln-${k}`} className="vln-kind vln-panel vln-rise" data-lag={i} style={{ "--rgb": KINDS[k].rgb } as CSSProperties}>
            <header className="vln-panel-head">
              <b>0{i + 1}</b>
              <span>{KINDS[k].eyebrow}</span>
              <em>{LIGHTS.filter((l) => l.kind === k).map((l) => l.label).join(" · ")}</em>
            </header>
            <h2>{KINDS[k].title}</h2>
            <p>{KINDS[k].body}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- a still of the app, added once the demo cast exists */}
            {KINDS[k].screen ? <img className="vln-screen" src={KINDS[k].screen} alt="" loading="lazy" /> : null}
          </article>
        ))}
      </section>

      <div className="vln-rule vln-rise"><span>Two ways in</span><i aria-hidden="true" /><span aria-hidden="true">04 — 05</span></div>
      <section id="vln-doors" className="vln-doors">
        <div className="vln-door vln-panel vln-rise">
          <header className="vln-panel-head"><b>04</b><span>For students</span><em>Free</em></header>
          <h2>Step inside.</h2>
          <p>Sign up with your school email. It&apos;s free, and only students can join.</p>
          <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn">Create your account</a>
        </div>
        <div className="vln-door vln-panel vln-rise" data-lag={1} style={{ "--rgb": KINDS.events.rgb } as CSSProperties}>
          <header className="vln-panel-head"><b>05</b><span>For clubs</span><em>help@connectvibe.app</em></header>
          <h2>Bring your club.</h2>
          <p>A page, your events, and a chat your members will open. Write to us and we&apos;ll set it up with you.</p>
          <a href={CLUB_HREF} className="vln-btn vln-btn-ghost">Email us</a>
        </div>
      </section>

      <section className="vln-close vln-rise">
        {/* The wordmark as a sun: three orbits, one small planet per kind. */}
        <div className="vln-orbits" aria-hidden="true">
          {KIND_ORDER.map((k, i) => {
            const w = 340 + i * 190, h = Math.round(w * 0.34);
            const path = `path("M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 1 0 ${h / 2}")`;
            return <span key={k} style={{ width: w, height: h, "--rgb": KINDS[k].rgb } as CSSProperties}><b style={{ offsetPath: path, animationDuration: `${14 + i * 9}s`, animationDelay: `${-i * 5}s` }} /></span>;
          })}
        </div>
        <span className="vln-wordmark vln-wordmark-xl">vibe<i>.</i></span>
        <p className="vln-tagline">Your campus. Your people. Yourself.</p>
        <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn">Sign up</a>
        <a href={LOGIN_HREF} data-warp-trigger className="vln-textlink">Already have an account? Log in</a>
        <StoreLinks />
        <span className="vln-schools">{LANDING_SCHOOL_LABELS.join(" · ")}</span>
      </section>

      {/* No data-warp-trigger in the footer: the warp would hijack these links. */}
      <footer className="vln-footer">
        <span>© CONNECTVIBE. LLC</span>
        <nav aria-label="Legal and support">
          {FOOTER_LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <p>Vibe is not affiliated with Indiana University or Purdue University.</p>
      </footer>
    </div>
  );
}

/**
 * Store links (Franky's decision D3: install means the real store apps).
 * Renders nothing while both store env vars are unset. Plain text links on
 * purpose, never a drawn badge: Apple and Google publish official badge art
 * with rules, and an imitation is worse than none. No data-warp-trigger:
 * these links leave Vibe.
 */
function StoreLinks() {
  const links = storeLinksFor(usePlatform());
  if (links.length === 0) return null;
  return (
    <nav aria-label="Get the Vibe app" className="vln-stores">
      {links.map((l) => (
        <a key={l.key} href={l.href}>Get Vibe on <b>{l.store}</b> <span aria-hidden="true">→</span></a>
      ))}
    </nav>
  );
}
