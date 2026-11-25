"use client";

import { KineticWordmark } from "@/components/brand/KineticWordmark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { enabledSchoolSystems } from "@/lib/auth/school-email-domains";
import { SYSTEM_LABEL } from "@/lib/iu/campuses";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/native/store-links";
import { isIosPlatform, type Platform } from "@/lib/pwa/display-mode";
import { usePlatform } from "@/lib/pwa/use-standalone";
import { landingCta } from "@/lib/waitlist/view";

import { NightSky } from "../night-sky";
import { frauncesSoft, landingMono } from "../soft-font";
import { Art } from "./art";
import { ART_EXTRA } from "./art-data";
import { CampusLights } from "./campus-lights";
import { CloseRing } from "./close-ring";
import { CollapseRings } from "./collapse-rings";
import { CoralDrop } from "./coral-drop";
import { DotPhoto } from "./dot-photo";
import { HeadingDots } from "./heading-dots";
import { HeroDots } from "./hero-dots";
import { Planet } from "./planet";
import { Starfield } from "./starfield";
import "./system.css";

/**
 * The landing, "find your system" (Nov 23, 2026). Franky's pick from the
 * landing board (vibe-marketing/campaigns/2026-11-landing-revamp/board,
 * hero 3): his dunes photo fading into dots, a coral sun, his people on a
 * hand-drawn orbit; then made of your people, bring your club, everything
 * looks different (Otto, once), one campus at a time, before you sign up
 * (the questions, Nov 23), and the close.
 *
 * The drawn art is static SVG from the board's export (art.tsx); the photo
 * in dots is a canvas (hero-dots.tsx); the dust and the warp into sign-up
 * are the classic landing's NightSky with no lights. Everything meant to be
 * read is real text and shows on the first frame; only the hero's picture
 * fades in once it is drawn. The classic landing stays behind LANDING=classic
 * (src/app/page.tsx) for a rollback.
 */

const WARP_DURATION_MS = 750;
const LOGIN_HREF = "/auth/login";
const CLUB_HREF = "mailto:help@connectvibe.app?subject=Bring%20my%20club%20to%20Vibe";
const SRC = "/landing/system";
const CREAM_DUST: readonly string[] = ["246,241,234"];
// Reads the code flag PURDUE_SIGNUPS_ENABLED (never an env var), so the server
// render and the hydrated page agree. "IU and Purdue students in Indianapolis"
// is the one school line G11 allows; turning Purdue off drops it from the line.
const SCHOOLS = enabledSchoolSystems().map((s) => SYSTEM_LABEL[s]).join(" and ");

const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/community", label: "Guidelines" },
  { href: "/support", label: "Support" },
] as const;

/**
 * "bring your club.": two desktop screens of a sample club, Coffee & Chess (the practice copy, Nov 23, 2026;
 * invented, its cover drawn in code), cropped to the club itself. No SAMPLE pill and no "made-up club" line
 * (Franky, Nov 23: they spoil the pictures); the alt text still says it's a made-up club.
 */
const SCREENS = [
  { stem: "club-page", dims: [2184, 1584], alt: "A made-up club's page on Vibe, on a computer: Coffee & Chess, its cover a chessboard and a cup of coffee, its followers and members, and Blitz Night up next." },
  { stem: "club-chat", dims: [1944, 1642], alt: "A made-up club's chat on Vibe, on a computer: members vote on what to play next week and tap Going for Blitz Night, with the club's events and Announcement Board beside it." },
] as const;

/**
 * "before you sign up.": the questions a student asks first, every answer open (no accordion). Franky kept this
 * from the taste-skill trial (Nov 23, 2026: vibe-marketing/campaigns/2026-11-landing-revamp/taste-trial), with
 * how to keep Vibe on a home screen, since there is nothing to download yet. The steps are the app's own
 * (settings/notifications-card-view.ts). Once a store listing is live, the first answer points to it instead.
 * Check-in: officers see who came; everyone else sees the count from 5 up (checkinCountLine).
 */
const HAS_STORE = Boolean(APP_STORE_URL || PLAY_STORE_URL);
const FAQ: readonly { q: string; a: ReactNode }[] = [
  {
    q: "Is there an app to download?",
    a: HAS_STORE
      ? "Yes. Get it from the store link at the bottom of this page, or keep using Vibe in your browser."
      : "No download needed: Vibe runs in your browser. To keep it on your home screen on iPhone, tap Share in Safari, then Add to Home Screen. On Android, open Chrome’s menu, then Add to Home screen.",
  },
  { q: "What does it cost?", a: "Nothing. Vibe is free for students, and so is setting up your club’s page with us." },
  { q: "Who sees that I went to an event?", a: "The club’s officers. Everyone else only sees how many checked in, once five or more have." },
  {
    q: "How does my club get on Vibe?",
    a: <><a href={CLUB_HREF}>Email us</a>. We’ll meet your officers in person and set up the page together.</>,
  },
];

/** The hero's sun: where it sits and how big, per layout (the board's export, art-data.ts). */
const { desktop: HD, phone: HP } = ART_EXTRA.hero;
const SUN_STYLE = {
  "--sx": `${HD.sun[0] * 100}%`, "--sy": `${HD.sun[1] * 100}%`, "--sr": `${((HD.sun[2] * 2) / HD.w) * 100}%`,
  "--psx": `${HP.sun[0] * 100}%`, "--psy": `${HP.sun[1] * 100}%`, "--psr": `${((HP.sun[2] * 2) / HP.w) * 100}%`,
} as CSSProperties;

/** The close's coral sun, in em of the wordmark, per layout (the board's export measured it). */
/**
 * The near side of the sun's inner ring runs in front of it (Franky, Nov 23, after ship: "the ring at the bottom of
 * the orange dot should go over it, and it should be above the ring at the top"). close-front is the inner ring's own
 * stroke again (the board's export-front.mjs), shown only over the sun's lower half: a half disc cut along the rings'
 * tilt (-10 degrees, export.html), a little wider than the sun so the two strokes meet cleanly at its edge, and wider
 * than its squash when the drop lands (fys-land starts at 1.15 times its width), so the ring never slips behind it.
 */
const RING_TILT = -10;
function frontClip([cx, cy, r]: readonly number[]): string {
  const R = r * 1.18, pts: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((RING_TILT + (i / 12) * 180) * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)).toFixed(4)}em ${(cy + R * Math.sin(a)).toFixed(4)}em`);
  }
  return `polygon(${pts.join(", ")})`;
}
const FRONT_STYLE = { "--fclip": frontClip(ART_EXTRA.close.desktop.orb), "--pfclip": frontClip(ART_EXTRA.close.phone.orb) } as CSSProperties;

const ORB_STYLE = {
  "--ox": `${ART_EXTRA.close.desktop.orb[0]}em`, "--oy": `${ART_EXTRA.close.desktop.orb[1]}em`, "--or": `${ART_EXTRA.close.desktop.orb[2]}em`,
  "--pox": `${ART_EXTRA.close.phone.orb[0]}em`, "--poy": `${ART_EXTRA.close.phone.orb[1]}em`, "--por": `${ART_EXTRA.close.phone.orb[2]}em`,
} as CSSProperties;

/** The sun's soft coral light (Nov 24; the board's lift-sunglow.mjs took it out of close-back, so it can come from the
 *  dot): its centre, radius and light at the centre, in em, per layout; 0.35 of that light at 45%, as the board drew it. */
const glowVars = (pre: string, [x, y, r, a]: readonly number[]) => ({
  [`--${pre}gx`]: `${x}em`, [`--${pre}gy`]: `${y}em`, [`--${pre}gr`]: `${r}em`, [`--${pre}ga`]: `${a}`, [`--${pre}gb`]: `${+(a * 0.35).toFixed(4)}`,
});
const GLOW_STYLE = { ...glowVars("", ART_EXTRA.close.desktop.glow), ...glowVars("p", ART_EXTRA.close.phone.glow) } as CSSProperties;

/** "see you there.": the night band across his eyes (its outline, fractions of the photo), and Otto in it. */
const W = ART_EXTRA.window;
// Otto pokes out of the band (round 6): he is hidden only below its lower edge.
const BAND_CLIP = { clipPath: `polygon(${W.pop.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ")})` } as CSSProperties;
const OTTO_STYLE = { left: `${W.otto[0] * 100}%`, top: `${W.otto[1] * 100}%`, width: `${W.otto[2] * 100}%` } as CSSProperties;

export function SystemLanding({ signupOpen }: { signupOpen: boolean }) {
  const router = useRouter();
  const cta = landingCta(signupOpen);
  const [warping, setWarping] = useState(false);
  // The hero's picture and its notes fade in together once the dots are drawn (system.css).
  const [drawn, setDrawn] = useState(false);
  const onDrawn = useCallback(() => setDrawn(true), []);

  // Where the warp goes, fetched ahead so the jump lands at once.
  useEffect(() => { router.prefetch(LOGIN_HREF); if (cta.href.startsWith("/")) router.prefetch(cta.href); }, [router, cta.href]);
  // soft arrivals (Nov 23, motion idea 5): a club screen that hasn't loaded yet waits unseen and fades up as it arrives
  // (system.css data-arrive). Set from here, after checking, so without JavaScript the screens simply show.
  useEffect(() => {
    const offs: (() => void)[] = [];
    document.querySelectorAll<HTMLElement>(".fys-club .fys-screen").forEach((box) => {
      const img = box.querySelector("img");
      if (!img || img.complete) return;
      box.dataset.arrive = "wait";
      const done = () => { box.dataset.arrive = "in"; };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      offs.push(() => { img.removeEventListener("load", done); img.removeEventListener("error", done); delete box.dataset.arrive; });
    });
    return () => offs.forEach((off) => off());
  }, []);

  // The warp (kept from the classic landing): any element marked
  // data-warp-trigger streaks the dust outward, then goes to its own href.
  // Capture phase so it beats Next's Link; modifier clicks still open a new
  // tab. The sky is pinned over the whole screen while it plays (system.css),
  // so it plays from the close's buttons too. It goes at once with reduced motion.
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

  return (
    <div className={`fys-root ${frauncesSoft.variable} ${landingMono.variable}${warping ? " is-warping" : ""}`}>
      <header className="fys-bar">
        <KineticWordmark className="fys-wm" dotClassName="fys-wm-dot" />
        <nav aria-label="Account">
          <a href={LOGIN_HREF} data-warp-trigger className="fys-tl">Log in</a>
          <a href={cta.href} data-warp-trigger className="fys-btn fys-btn-sm">{cta.label}</a>
        </nav>
      </header>

      <main>
        <section className="fys-hero" data-wait={drawn ? undefined : ""} aria-labelledby="fys-title">
          <NightSky lights={[]} links={[]} activeId={null} warping={warping} tints={CREAM_DUST} shootingStars={false} pinnedWarp />
          <div className="fys-hero-art" role="img" aria-label="Franky at the dunes in the evening light, his photo fading out into dots that gently flow, looking up at a coral sun. His people are drawn on an orbit around him: the run club, an astronomy callout, the group chat.">
            <HeroDots onDrawn={onDrawn} />
            <span className="fys-sun" style={SUN_STYLE} />
            <Art name="hero" className="fys-hero-ink" eager />
          </div>
          <div className="fys-hero-copy">
            <p className="fys-k">Open now<b>/</b>IU + Purdue</p>
            <h1 id="fys-title" className="fys-hl fys-hero-hl fys-dotted"><span>your campus.</span> <span>your people.</span> <span>yourself<i className="fys-stop">.</i></span></h1>
            <p className="fys-body">Vibe is the social app for your campus, built around clubs. Find your clubs, your events, and each other. <strong>Free with your school email.</strong></p>
            <div className="fys-row">
              <a href={cta.href} data-warp-trigger className="fys-btn">{cta.label}</a>
              <a href="#fys-club" className="fys-btn fys-ghost">Bring your club</a>
            </div>
          </div>
        </section>

        <section className="fys-people" aria-labelledby="fys-people-title">
          <div className="fys-col">
            <p className="fys-k">Your people<b>/</b>01</p>
            <h2 id="fys-people-title" className="fys-hl fys-md fys-dotted"><span>made of</span> <span>your people<i className="fys-stop">.</i></span></h2>
            <ul className="fys-three">
              <li><span className="fys-lab">Clubs</span><p><strong>Follow any club</strong> to see its events. Join it to talk in its chats.</p></li>
              <li><span className="fys-lab">Events</span><p><strong>See what’s on</strong> this week, and check in at the door with a code.</p></li>
              <li><span className="fys-lab">Each other</span><p><strong>Post, follow and message</strong> the people you meet. Make your profile yours.</p></li>
            </ul>
          </div>
          <div className="fys-pp" role="img" aria-label="A planet made of tiny people, each one a dot, with one coral person on its ring: you.">
            <div className="fys-pp-clip"><Planet /></div>
            <Art name="people" />
          </div>
        </section>

        <section id="fys-club" className="fys-club" aria-labelledby="fys-club-title">
          <div className="fys-fan">
            {SCREENS.map((s, i) => (
              <div key={s.stem} className={`fys-screen fys-s${i + 1}`}>
                <picture>
                  <source type="image/avif" srcSet={`${SRC}/${s.stem}-640.avif 640w, ${SRC}/${s.stem}-1120.avif 1120w`} sizes="(min-width: 900px) 34vw, 88vw" />
                  <img src={`${SRC}/${s.stem}-1120.webp`} srcSet={`${SRC}/${s.stem}-640.webp 640w, ${SRC}/${s.stem}-1120.webp 1120w`} sizes="(min-width: 900px) 34vw, 88vw" width={s.dims[0]} height={s.dims[1]} alt={s.alt} loading="lazy" decoding="async" />
                </picture>
              </div>
            ))}
          </div>
          <div className="fys-col">
            <p className="fys-k">Clubs<b>/</b>02</p>
            <h2 id="fys-club-title" className="fys-hl fys-md"><span>bring your</span> <span>club<i className="fys-stop">.</i></span></h2>
            <p className="fys-body">Run a club? Give it a home on Vibe. We’ll set up its page with you, in person. Free.</p>
            <ol className="fys-list">
              <li><span className="fys-n">01</span><span><strong>The page.</strong> Anyone can follow it to see your events.</span></li>
              <li><span className="fys-n">02</span><span><strong>The board.</strong> Officers post the news.</span></li>
              <li><span className="fys-n">03</span><span><strong>The chat.</strong> Members talk, plan and say who’s going.</span></li>
            </ol>
            <div className="fys-row"><a href={CLUB_HREF} className="fys-btn">Bring your club</a></div>
          </div>
        </section>

        <section className="fys-eyes" aria-labelledby="fys-eyes-title">
          <div className="fys-col">
            <p className="fys-k">In person<b>/</b>03</p>
            <h2 id="fys-eyes-title" className="fys-hl fys-md"><span>see you there<i className="fys-stop">.</i></span></h2>
            <p className="fys-body">Find what’s on this week, tap Going, and show up. The best part happens off your phone.</p>
          </div>
          <div className="fys-print" role="img" aria-label="Franky leaning out of a car window on a long road, laughing, the photo's edges breaking into dots. A band of night sky across his eyes, with Otto popping out of it, who says: it's nicer in here, honestly.">
            <DotPhoto>
              <picture>
                <source type="image/avif" srcSet={`${SRC}/eyes-540.avif 540w, ${SRC}/eyes-1080.avif 1080w`} sizes="(min-width: 900px) 38vw, 92vw" />
                <img src={`${SRC}/eyes-1080.webp`} srcSet={`${SRC}/eyes-540.webp 540w, ${SRC}/eyes-1080.webp 1080w`} sizes="(min-width: 900px) 38vw, 92vw" width={1080} height={1350} alt="" loading="lazy" decoding="async" />
              </picture>
            </DotPhoto>
            <Art name="eyes-window" />
            <div className="fys-window" style={BAND_CLIP}>
              <picture style={OTTO_STYLE}>
                <source type="image/avif" srcSet={`${SRC}/otto-260.avif 260w, ${SRC}/otto-520.avif 520w`} sizes="(min-width: 900px) 10vw, 24vw" />
                <img src={`${SRC}/otto-520.webp`} srcSet={`${SRC}/otto-260.webp 260w, ${SRC}/otto-520.webp 520w`} sizes="(min-width: 900px) 10vw, 24vw" width={520} height={317} alt="" loading="lazy" decoding="async" />
              </picture>
            </div>
            <Art name="eyes-note" />
          </div>
        </section>

        <section className="fys-open" aria-labelledby="fys-open-title">
          <div className="fys-col">
            <p className="fys-k">Where it’s open<b>/</b>04</p>
            <h2 id="fys-open-title" className="fys-hl fys-md"><span>one campus</span> <span>at a time<i className="fys-stop">.</i></span></h2>
            <p className="fys-body">Open now for {SCHOOLS} students. {signupOpen ? "Sign up free" : "Join the waitlist"} with your school email.</p>
          </div>
          <div className="fys-line" role="img" aria-label="A line of campuses: Indianapolis and Bloomington lit up, the next ones question marks.">
            <CampusLights />
            <Art name="open" />
          </div>
        </section>

        <section className="fys-faq" aria-labelledby="fys-faq-title">
          <div className="fys-col">
            <p className="fys-k">Questions<b>/</b>05</p>
            <h2 id="fys-faq-title" className="fys-hl fys-md"><span>before you</span> <span>sign up<i className="fys-stop">.</i></span></h2>
          </div>
          <dl className="fys-faq-list">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="fys-close" aria-label="Sign up">
          {/* The full stop is the sun (.fys-orb), with its light under everything (.fys-sunglow), its rings behind it and the letters (close-back), and the inner ring's near side over it (close-front). As the full stop falls in, its system gathers onto the sun (collapse-rings.tsx). */}
          <span className="fys-big" aria-hidden="true"><Art name="close-back" unit="em" className="fys-close-back" />vibe<i>.</i><span className="fys-orb" style={ORB_STYLE} /><span className="fys-sunglow" style={GLOW_STYLE} /><span className="fys-front" style={FRONT_STYLE}><Art name="close-front" unit="em" className="fys-close-front" /></span><CloseRing style={ORB_STYLE} /><CollapseRings style={ORB_STYLE} /></span>
          <div className="fys-row">
            <a href={cta.href} data-warp-trigger className="fys-btn">{cta.label}</a>
            <a href={CLUB_HREF} className="fys-btn fys-ghost">Bring your club</a>
          </div>
          <p className="fys-fine">Already have an account? <a href={LOGIN_HREF} data-warp-trigger>Log in</a></p>
          <StoreLinks />
        </section>
      </main>

      {/* No data-warp-trigger in the footer: the warp would hijack these links. */}
      {/* the coral full stop: one dot that drops from headline to headline as the page scrolls, down into "vibe." */}
      <CoralDrop />
      {/* the heading dots: each headline condenses out of dots as it rises into view and goes back to dust as it leaves, as the full stop takes off */}
      <HeadingDots />
      {/* the starfield camera: the dust behind the page in three depths, moving with the scroll (starfield.tsx) */}
      <Starfield />
      <footer className="fys-footer">
        <span>© CONNECTVIBE. LLC</span>
        <nav aria-label="Legal and support">
          {FOOTER_LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <p>Vibe is not affiliated with Indiana University or Purdue University.</p>
      </footer>
    </div>
  );
}

// The store listings (src/lib/native/store-links.ts) are null until that
// store's env var holds a real listing: none today, so nothing renders.
// Plain text links, never a drawn badge (classic landing's rule, D3).
type StoreLink = { key: string; href: string; store: string };
const APP_STORE_LINK: StoreLink | null = APP_STORE_URL ? { key: "app-store", href: APP_STORE_URL, store: "the App Store" } : null;
const PLAY_STORE_LINK: StoreLink | null = PLAY_STORE_URL ? { key: "play-store", href: PLAY_STORE_URL, store: "Google Play" } : null;

function storeLinksFor(platform: Platform | null): StoreLink[] {
  if (isIosPlatform(platform)) return APP_STORE_LINK ? [APP_STORE_LINK] : [];
  if (platform?.startsWith("android-")) return PLAY_STORE_LINK ? [PLAY_STORE_LINK] : [];
  return [APP_STORE_LINK, PLAY_STORE_LINK].filter((l): l is StoreLink => l !== null);
}

function StoreLinks() {
  const links = storeLinksFor(usePlatform());
  if (links.length === 0) return null;
  return (
    <nav aria-label="Get the Vibe app" className="fys-stores">
      {links.map((l) => (
        <a key={l.key} href={l.href}>Get Vibe on <b>{l.store}</b> <span aria-hidden="true">→</span></a>
      ))}
    </nav>
  );
}
