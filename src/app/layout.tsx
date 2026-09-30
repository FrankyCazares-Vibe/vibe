import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";

import { CustomCursor } from "@/components/CustomCursor";
import { ToastHost } from "@/components/feedback/ToastHost";
import { NativeBridge } from "@/components/native/NativeBridge";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import { ThemeSync } from "@/lib/theme/ThemeSync";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const SITE_TITLE = "Vibe · Your campus. Your people. Yourself.";
const SITE_TAGLINE = "Your campus. Your people. Yourself.";

export const metadata: Metadata = {
  // The canonical host (the apex 301s to www), so preview image URLs are
  // absolute and never go through that redirect.
  metadataBase: new URL("https://www.connectvibe.app"),
  title: SITE_TITLE,
  description: SITE_TAGLINE,
  // Link previews (iMessage, Instagram, X, LinkedIn). The picture is
  // src/app/opengraph-image.tsx + twitter-image.tsx; no `images` key here on
  // purpose, since one would override those files.
  openGraph: {
    type: "website",
    siteName: "Vibe",
    title: SITE_TITLE,
    description: SITE_TAGLINE,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_TAGLINE,
  },
  icons: {
    icon: [
      // Google Search does not use SVG. It wants a square ICO/PNG >48px
      // on a stable URL, linked from the homepage.
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/vibe-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  // Home Screen app on iPhone. The manifest link isn't set here on purpose:
  // src/app/manifest.ts adds it by existing. "default" keeps the status bar
  // opaque; black-translucent has reported standalone bugs with
  // viewportFit "cover" on iOS 26/27. No startup (splash) images in v1, so
  // iOS shows a plain screen until first paint.
  appleWebApp: { capable: true, title: "Vibe", statusBarStyle: "default" },
  // Next 16 renders `capable` as the new `mobile-web-app-capable` only. The
  // apple- name is the one iOS has always read, and Apple has always tied
  // the status-bar style to it (unverified whether iOS 26+ still does), so
  // it goes out too. Sending both is harmless.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is the RESOLVED theme (light | dark, never "system"). The
    // server can't know the student's device, so it ships "light" and the
    // boot script below corrects the attribute before first paint; React
    // then keeps whatever the DOM says (suppressHydrationWarning), the Next
    // "preventing flash before hydration" recipe. DEFAULT_THEME_PREF is
    // "system" (Auto) since S68 wave 5, so a dark device gets Night here.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={cn("font-mono", jetbrainsMono.variable)}
    >
      <head>
        {/* FIRST child of <head>: reads localStorage.vibe_theme, resolves
            "system" with matchMedia and sets data-theme. Nothing else; the
            theme-color meta below is React's (viewport.themeColor) and
            applyTheme repaints it after mount. The four static pages paste
            this same string; theme.test.ts fails per file when it drifts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,800;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* The theme after first paint: the theme-color meta, Auto following
            the phone live, other tabs and the legacy iframes. Renders
            nothing. FIRST in <body> on purpose, so its mount effect runs
            before any page's: the Settings card can then paint the account's
            theme over it on a new device, never the other way round. */}
        <ThemeSync />
        {children}
        {/* One toast for every React route; failed requests land here via
            vibeRequest (src/lib/feedback). Static pages have their own. */}
        <ToastHost />
        {/* Single cursor for the whole React app — landing, auth, every
            shelled surface. Static prototype pages have their own. */}
        <CustomCursor />
        {/* Registers /sw.js after load, on www.connectvibe.app only (or
            NEXT_PUBLIC_SW_DEV=1 locally); renders nothing. The static
            /html pages register through public/html/_sw.js instead. */}
        <ServiceWorkerRegistrar />
        {/* The App Store / Google Play apps' half of the bridge: links the
            phone opens, new-window links, the status bar, Android back.
            Renders nothing and does nothing in a browser. It decides on the
            client, so this layout never reads headers() (that would make
            every route dynamic). */}
        <NativeBridge />
      </body>
    </html>
  );
}