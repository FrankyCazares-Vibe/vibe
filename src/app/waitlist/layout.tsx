import type { Viewport } from "next";
import Link from "next/link";

import "@/components/landing/landing.css";
import { CookieNotice } from "@/components/legal/CookieNotice";
import { frauncesSoft, landingMono } from "@/components/landing/soft-font";

import "./waitlist.css";

// Always Night, like the landing, so the browser bars are too (NIGHT_ONLY_PATHS
// in src/lib/theme/theme.ts keeps them dark after load).
export const viewport: Viewport = { themeColor: "#0C0B0B" };

/**
 * The waitlist pages wear the landing's look: its Night colours, the soft
 * wordmark and its hairline panels (landing.css), in one calm column.
 */
export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`vln-root vwl-root ${frauncesSoft.variable} ${landingMono.variable}`}>
      <header className="vwl-bar">
        <Link href="/" className="vln-wordmark" aria-label="Vibe home">
          vibe<i>.</i>
        </Link>
        <nav aria-label="Account">
          <Link href="/auth/login" className="vln-textlink">Log in</Link>
        </nav>
      </header>
      <main className="vwl-main">{children}</main>
      <footer className="vln-footer">
        <span>© CONNECTVIBE. LLC</span>
        {/* The landing's footer links, in its order. Privacy lands on the
            waitlist's own section (section 11), like the form's notice. */}
        <nav aria-label="Legal and support">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy#waitlist">Privacy</Link>
          <Link href="/legal/community">Guidelines</Link>
          <Link href="/support">Support</Link>
        </nav>
        <p>Vibe is not affiliated with Indiana University or Purdue University.</p>
      </footer>
      {/* The one-time cookie notice of the signed-out pages (a notice, nothing to accept). */}
      <CookieNotice tone="night" />
    </div>
  );
}
