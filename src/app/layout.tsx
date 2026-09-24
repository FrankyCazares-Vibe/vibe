import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";

import { CustomCursor } from "@/components/CustomCursor";
import { ToastHost } from "@/components/feedback/ToastHost";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "Vibe",
  description: "Your campus, your career, one profile.",
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
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
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
      </body>
    </html>
  );
}