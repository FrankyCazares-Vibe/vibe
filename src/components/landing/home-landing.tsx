"use client";

import localFont from "next/font/local";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";

import { enabledSchoolSystems } from "@/lib/auth/school-email-domains";
import { SYSTEM_LABEL } from "@/lib/iu/campuses";
import { HAS_DEMO_FILM } from "@/lib/landing/demo-media";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/native/store-links";
import { isIosPlatform, type Platform } from "@/lib/pwa/display-mode";
import { usePlatform } from "@/lib/pwa/use-standalone";

import { DayOnVibe, MOMENTS, type DayHandle, type MomentId } from "./day-on-vibe";
import { NightSky, type SkyLight } from "./night-sky";
import { Readout, type Still } from "./readout";
import "./landing.css";

// The soft wordmark face (the share card's: SOFT 100, opsz 144). The app-wide
// Fraunces link in layout.tsx has no SOFT axis, so the landing loads its own,
// under its own family name ("frauncesSoft", from the const): next/font/google
// names its face plain "Fraunces", and the layout's Google faces won over it.
// The file is Google Fonts' Fraunces latin subset (wght, opsz, SOFT axes),
// under the OFL: its licence sits beside it in fraunces-soft.OFL.txt. The
// stand-in until it loads is a serif sized to match, so the swap stays serif.
const frauncesSoft = localFont({ src: "./fraunces-soft.woff2", weight: "100 900", style: "normal", variable: "--font-soft", display: "swap", adjustFontFallback: "Times New Roman" });

const WARP_DURATION_MS = 750;
const LOGIN_HREF = "/auth/login";
const SIGNUP_HREF = "/auth/signup";
const CLUB_HREF = "mailto:help@connectvibe.app?subject=Bring%20my%20club%20to%20Vibe";
// Reads the code flag PURDUE_SIGNUPS_ENABLED (never an env var), so the server
// render and the hydrated page agree. Turning Purdue off removes its label.
const LANDING_SCHOOL_LABELS: readonly string[] = enabledSchoolSystems().map((s) => SYSTEM_LABEL[s]);

type Kind = "clubs" | "events" | "people";

/**
 * The three things you can do. `rgb` is the colour that kind's lights lean
 * toward. `still` is one real screen from the demo film (readout.tsx), and
 * `moment` the part of the day it comes from in "A day on Vibe".
 */
const KINDS: Record<Kind, { eyebrow: string; title: string; body: string; rgb: string; still: Still; moment: MomentId }> = {
  clubs: {
    eyebrow: "Clubs", title: "Find your clubs.", body: "Follow the ones you’re curious about, join the ones you love, and keep up with their posts and chats in one place.", rgb: "255,92,53", moment: "evening",
    still: { stem: "still-orgs", fig: "Orgs", alt: "The Orgs tab in Vibe: North Hall, Tower Floor 3 and Finance Club, each with a Following, Join or Request button." },
  },
  events: {
    eyebrow: "Events", title: "See what’s on.", body: "What your clubs have on this week, in one place. RSVP in a tap so you never miss it.", rgb: "246,196,104", moment: "afternoon",
    still: { stem: "still-events", fig: "Events", fade: true, alt: "The Events tab in Vibe: Blitz Night by Chess Club, Friday from 7 to 10 pm in the Campus Center, marked Going, with Resume Review Night below it." },
  },
  people: {
    eyebrow: "Each other", title: "Find each other.", body: "Meet people from your major and your clubs, message them, and make your profile look like you.", rgb: "150,186,255", moment: "night",
    still: { stem: "still-dm", fig: "Messages", bottom: true, alt: "A direct message in Vibe: two friends plan a cookout, then one asks “hey are you going to blitz night tonight?”" },
  },
};
const KIND_ORDER: Kind[] = ["clubs", "events", "people"];

/** The lights in the hero sky. Invented, generic names: never a real club or person. */
const LIGHTS: (SkyLight & { kind: Kind; label: string })[] = [
  { id: "film", kind: "clubs", label: "Film club", rgb: "255,92,53", size: 9, m: [0.2, 0.17], d: [0.56, 0.26] },
  { id: "robotics", kind: "clubs", label: "Robotics", rgb: "255,146,124", size: 6, m: [0.8, 0.14], d: [0.86, 0.2] },
  { id: "tonight", kind: "events", label: "Tonight", rgb: "246,196,104", size: 11, m: [0.62, 0.29], d: [0.72, 0.42] },
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
  // A card the mouse opened closes a moment after the mouse leaves both the
  // light and the card. A click, Enter or focus inside it pins it open.
  const pinned = useRef(false);
  const closing = useRef(0);
  const hero = useRef<HTMLElement>(null);
  const openLight = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const day = useRef<DayHandle>(null);
  const open = LIGHTS.find((l) => l.id === active) ?? null;

  const hold = () => window.clearTimeout(closing.current);
  const letGo = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    hovered.current = null;
    hold();
    closing.current = window.setTimeout(() => { if (!pinned.current) setActive(null); }, 350);
  };
  // Focus moving on past the open light and its card closes the card, so it
  // never sits over the next light's focus ring. A click on the card's text
  // moves focus nowhere (relatedTarget null) and leaves it open.
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget;
    if (to && !openLight.current?.contains(to) && !pop.current?.contains(to)) setActive(null);
  };

  // A card that would run past the bottom of the sky (a low light on a short
  // screen) opens upward instead. Measured before paint, so it never jumps.
  useLayoutEffect(() => {
    const card = pop.current, box = hero.current;
    if (!card || !box) return;
    card.classList.toggle("is-up", card.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom - 12);
  }, [active]);

  // The warp: any element marked data-warp-trigger plays the streak, then
  // goes to its own href. Capture phase so it beats Next's Link; modifier
  // clicks still open a new tab. It navigates at once with reduced motion,
  // and when the sky is mostly off screen (the buttons further down), where
  // the streak would play out of sight and the click would just seem slow.
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
      const skyInView = (hero.current?.getBoundingClientRect().bottom ?? 0) > window.innerHeight * 0.4;
      setWarping(true);
      router.prefetch(dest);
      window.setTimeout(() => router.push(dest), still || !skyInView ? 0 : WARP_DURATION_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, warping]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Focus on the card's link would fall to the page with the card: hand it back to the light.
      if (pop.current?.contains(document.activeElement)) openLight.current?.focus();
      setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Everything below the hero emerges with the scroll: each .vln-rise gets
  // --p, 0 below the fold to 1 once it is well into view, and landing.css
  // turns that into the slide, the scale and the glow. --p is 1 in the CSS,
  // so with no JavaScript (or before it runs) everything shows; this hides
  // what is still below the fold. offsetTop, not getBoundingClientRect: the
  // transform must not feed back into its own input.
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
    <div className={`vln-root ${frauncesSoft.variable}${warping ? " is-warping" : ""}`}>
      <header className="vln-bar">
        <span className="vln-wordmark">vibe<i>.</i></span>
        <nav aria-label="Account">
          <a href={LOGIN_HREF} data-warp-trigger className="vln-textlink">Log in</a>
          <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn vln-btn-sm">Sign up</a>
        </nav>
      </header>

      <main>
        <section ref={hero} className="vln-hero" onClick={() => setActive(null)}>
          <div className="vln-clouds" aria-hidden="true" />
          <NightSky lights={LIGHTS} links={LINKS} activeId={active} warping={warping} />

          {/* The copy comes before the lights in the page order, so keyboard and
              screen-reader users meet the headline and Sign up first; the
              lights are absolutely placed, so the order doesn't move them. */}
          <div className="vln-hero-copy">
            <h1>The social app for <em>your campus.</em></h1>
            <p>Find your clubs, your events, and each other. Free with your school email.</p>
            <div className="vln-cta">
              <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn">Sign up</a>
              <a href="#vln-doors" className="vln-btn vln-btn-ghost">Bring your club</a>
            </div>
            <span className="vln-hint">Pick a light to see what’s out there.</span>
          </div>

          {/* Each card comes right after its own light, so Tab goes light,
              card, next light; it never leaves focus under an open card. */}
          {LIGHTS.map((l, i) => (
            <Fragment key={l.id}>
              <button
                ref={active === l.id ? openLight : undefined}
                type="button"
                className="vln-light"
                style={at(l, i, l.rgb)}
                aria-expanded={active === l.id}
                // Only while its card exists: an id that isn't in the page points nowhere.
                aria-controls={active === l.id ? "vln-pop" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = active === l.id && hovered.current !== l.id ? null : l.id;
                  pinned.current = next !== null;
                  setActive(next);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  hold();
                  hovered.current = l.id;
                  if (active !== l.id) { pinned.current = false; setActive(l.id); }
                }}
                onPointerLeave={letGo}
                onBlur={active === l.id ? onFocusOut : undefined}
              >
                <span className="vln-light-label">{l.label}</span>
              </button>
              {open && open.id === l.id ? (
                <div
                  ref={pop}
                  id="vln-pop"
                  className="vln-pop"
                  style={at(open, 0, open.rgb)}
                  onClick={(e) => e.stopPropagation()}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") hold(); }}
                  onPointerLeave={letGo}
                  onFocus={() => { pinned.current = true; }}
                  onBlur={onFocusOut}
                >
                  <span className="vln-eyebrow">{KINDS[open.kind].eyebrow}</span>
                  <strong>{KINDS[open.kind].title}</strong>
                  <p>{KINDS[open.kind].body}</p>
                  {/* Focus goes on to the panel it scrolls to, not back to the top of the page. */}
                  <a href={`#vln-${open.kind}`} onClick={() => { setActive(null); document.getElementById(`vln-${open.kind}`)?.focus({ preventScroll: true }); }}>
                    More below <span aria-hidden="true">↓</span>
                  </a>
                </div>
              ) : null}
            </Fragment>
          ))}
        </section>

        <div className="vln-rule vln-rise"><span>What’s out there</span><i aria-hidden="true" /><span aria-hidden="true">01 — 03</span></div>
        <section className="vln-kinds" aria-label="What you can do on Vibe">
          {KIND_ORDER.map((k, i) => (
            <article key={k} id={`vln-${k}`} tabIndex={-1} className="vln-kind vln-panel vln-rise" data-lag={i} style={{ "--rgb": KINDS[k].rgb } as CSSProperties}>
              <header className="vln-panel-head">
                <b>0{i + 1}</b>
                <span>{KINDS[k].eyebrow}</span>
                {/* One span per light: the strip shows the names that fit whole (landing.css). */}
                <em>{LIGHTS.filter((l) => l.kind === k).map((l, j) => <span key={l.id}>{j ? ` · ${l.label}` : l.label}</span>)}</em>
              </header>
              <h2>{KINDS[k].title}</h2>
              <p>{KINDS[k].body}</p>
              <Readout
                still={KINDS[k].still}
                n={i + 1}
                watch={HAS_DEMO_FILM ? { part: MOMENTS.find((m) => m.id === KINDS[k].moment)?.part ?? "", go: () => day.current?.watch(KINDS[k].moment) } : undefined}
              />
            </article>
          ))}
        </section>

        <div className="vln-rule vln-rise"><span>A day on Vibe</span><i aria-hidden="true" /><span aria-hidden="true">04</span></div>
        <DayOnVibe ref={day} />

        <div className="vln-rule vln-rise"><span>Two ways in</span><i aria-hidden="true" /><span aria-hidden="true">05 — 06</span></div>
        <section id="vln-doors" className="vln-doors">
          <div className="vln-door vln-panel vln-rise">
            <header className="vln-panel-head"><b>05</b><span>For students</span><em><span>Free</span></em></header>
            <h2>Step inside.</h2>
            <p>Sign up with your school email. It’s free, and only people who have one can join.</p>
            <a href={SIGNUP_HREF} data-warp-trigger className="vln-btn">Create your account</a>
          </div>
          <div className="vln-door vln-panel vln-rise" data-lag={1} style={{ "--rgb": KINDS.events.rgb } as CSSProperties}>
            <header className="vln-panel-head"><b>06</b><span>For clubs</span><em><span>help@connectvibe.app</span></em></header>
            <h2>Bring your club.</h2>
            <p>A page, your events, and a chat your members will open. Write to us and we’ll set it up with you.</p>
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
      </main>

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
